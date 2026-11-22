const mongoose = require('mongoose');
const Customer = require('./models/Customer');
const Item = require('./models/Item');
const Order = require('./models/Order');
const { Invoice, Counter } = require('./models/Invoice');
const CreditNote = require('./models/CreditNote');
const StockLedger = require('./models/StockLedger');
const { getFinancialYear, calculateGstLines } = require('./gst');
const { buildHsnByItemId } = require('./hsnHelper');
const { allocateFefoBatches } = require('./fefoHelper');

async function getItemBalanceBase(itemId, session = null) {
  const agg = StockLedger.aggregate([
    { $match: { item: new mongoose.Types.ObjectId(itemId) } },
    { $group: { _id: '$item', balanceBase: { $sum: '$qtyDelta' } } }
  ]);
  if (session) agg.session(session);
  const [row] = await agg;
  return row ? row.balanceBase : 0;
}

async function createOrder(input) {
  const { orderNo, customer: customerId, createdBy = 'salesman@factory.test', lines } = input;

  if (!orderNo) throw new Error('orderNo is required');
  if (!mongoose.Types.ObjectId.isValid(customerId)) throw new Error('Invalid customer ID');
  const customer = await Customer.findById(customerId);
  if (!customer) throw new Error(`Customer not found: ${customerId}`);

  if (!Array.isArray(lines) || lines.length === 0) throw new Error('lines must be a non-empty array');

  let totalPaisa = 0;
  const validatedLines = [];
  for (const line of lines) {
    if (!mongoose.Types.ObjectId.isValid(line.item)) throw new Error(`Invalid item ID: ${line.item}`);
    const item = await Item.findById(line.item);
    if (!item) throw new Error(`Item not found: ${line.item}`);
    if (!Number.isInteger(line.qtyBase) || line.qtyBase <= 0) throw new Error('qtyBase must be a positive integer');
    if (!Number.isInteger(line.ratePaisa) || line.ratePaisa < 0) throw new Error('ratePaisa must be a non-negative integer');

    const lineTotalPaisa = line.qtyBase * line.ratePaisa;
    totalPaisa += lineTotalPaisa;
    validatedLines.push({
      item: item._id,
      qtyBase: line.qtyBase,
      ratePaisa: line.ratePaisa,
      lineTotalPaisa
    });
  }

  // Does NOT touch StockLedger
  return Order.create({
    orderNo,
    customer: customer._id,
    createdBy,
    status: 'SUBMITTED',
    lines: validatedLines,
    totalPaisa
  });
}

async function approveOrder(orderId) {
  const order = await Order.findById(orderId);
  if (!order) throw new Error(`Order not found: ${orderId}`);
  if (order.status !== 'SUBMITTED') throw new Error(`Order cannot be approved from status ${order.status}`);

  for (const line of order.lines) {
    const balance = await getItemBalanceBase(line.item);
    if (line.qtyBase > balance) {
      const shortage = line.qtyBase - balance;
      const err = new Error(`Insufficient stock. Shortage: ${shortage}`);
      err.statusCode = 409;
      err.payload = { shortage, available: balance, requested: line.qtyBase };
      throw err;
    }
  }

  order.status = 'APPROVED';
  await order.save();
  return order;
}

async function invoiceOrder(orderId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findById(orderId).populate('customer').session(session);
    if (!order) throw new Error(`Order not found: ${orderId}`);
    if (order.status !== 'APPROVED') throw new Error(`Order must be APPROVED before invoicing (current: ${order.status})`);

    const fy = getFinancialYear(new Date());
    const counterKey = `INV-${fy}`;
    const counter = await Counter.findByIdAndUpdate(
      counterKey,
      { $inc: { seq: 1 } },
      { new: true, upsert: true, session }
    );
    const invoiceNo = `INV/${fy}/${String(counter.seq).padStart(4, '0')}`;

    const hsnByItemId = await buildHsnByItemId(order.lines, Item);
    const gst = calculateGstLines(order.lines, order.customer.state, { hsnByItemId });

    const [invoice] = await Invoice.create([{
      invoiceNo,
      financialYear: fy,
      order: order._id,
      customer: order.customer._id,
      placeOfSupply: order.customer.state,
      lines: gst.lines,
      taxablePaisa: gst.taxablePaisa,
      cgstPaisa: gst.cgstPaisa,
      sgstPaisa: gst.sgstPaisa,
      igstPaisa: gst.igstPaisa,
      totalPaisa: gst.totalPaisa
    }], { session });

    order.status = 'INVOICED';
    await order.save({ session });

    await session.commitTransaction();
    return invoice;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

async function dispatchOrder(orderId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findById(orderId).session(session);
    if (!order) throw new Error(`Order not found: ${orderId}`);
    if (order.status !== 'INVOICED') {
      throw new Error(`Order must be INVOICED before dispatch (current: ${order.status})`);
    }

    // Plan & validate all FEFO allocations before writing any ledger rows
    const plannedDispatches = [];
    for (const line of order.lines) {
      const allocations = await allocateFefoBatches({
        itemId: line.item,
        requiredQtyBase: line.qtyBase,
        session
      });
      plannedDispatches.push({ line, allocations });
    }

    // Write DISPATCH ledger rows per allocated batch inside session
    for (const { line, allocations } of plannedDispatches) {
      for (const slice of allocations) {
        await StockLedger.create([{
          item: line.item,
          qtyDelta: -slice.qtyBase,
          batchNo: slice.batchNo,
          expiryDate: slice.expiryDate,
          eventType: 'DISPATCH',
          sourceType: 'Order',
          sourceId: order._id,
          note: `Order dispatch: ${order.orderNo}${slice.batchNo ? ` [Batch ${slice.batchNo}]` : ''}`
        }], { session });
      }
    }

    order.status = 'DISPATCHED';
    await order.save({ session });

    await session.commitTransaction();
    return order;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

async function createCreditNote(invoiceId, reason) {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new Error(`Invoice not found: ${invoiceId}`);

  const fy = invoice.financialYear;
  const counter = await Counter.findByIdAndUpdate(
    `CN-${fy}`,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const creditNoteNo = `CN/${fy}/${String(counter.seq).padStart(4, '0')}`;

  return CreditNote.create({
    creditNoteNo,
    invoice: invoice._id,
    customer: invoice.customer,
    reason: reason || 'Invoice reversal',
    taxablePaisa: -invoice.taxablePaisa,
    cgstPaisa: -invoice.cgstPaisa,
    sgstPaisa: -invoice.sgstPaisa,
    igstPaisa: -invoice.igstPaisa,
    totalPaisa: -invoice.totalPaisa
  });
}

module.exports = {
  createOrder,
  approveOrder,
  invoiceOrder,
  dispatchOrder,
  createCreditNote
};
