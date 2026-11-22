const mongoose = require('mongoose');
const Payment = require('./models/Payment');
const { Invoice } = require('./models/Invoice');
const CreditNote = require('./models/CreditNote');
const Customer = require('./models/Customer');

async function getInvoiceOutstanding(invoiceId) {
  if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
    throw new Error('Invalid invoice ID');
  }
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) throw new Error(`Invoice not found: ${invoiceId}`);

  const [payAgg] = await Payment.aggregate([
    { $match: { invoice: invoice._id } },
    { $group: { _id: null, paidPaisa: { $sum: '$amountPaisa' } } }
  ]);

  const [cnAgg] = await CreditNote.aggregate([
    { $match: { invoice: invoice._id } },
    { $group: { _id: null, creditNotesPaisa: { $sum: '$totalPaisa' } } } // negative values
  ]);

  const paidPaisa = payAgg ? payAgg.paidPaisa : 0;
  const creditNotesPaisa = cnAgg ? cnAgg.creditNotesPaisa : 0;
  const outstandingPaisa = invoice.totalPaisa + creditNotesPaisa - paidPaisa;

  return {
    invoiceId: invoice._id,
    invoiceNo: invoice.invoiceNo,
    customerId: invoice.customer,
    invoiceTotalPaisa: invoice.totalPaisa,
    creditNotesPaisa,
    paidPaisa,
    outstandingPaisa
  };
}

async function recordPayment(input) {
  const { invoice: invoiceId, amountPaisa, paymentDate, mode, referenceNo } = input;

  if (!Number.isInteger(amountPaisa) || amountPaisa <= 0) {
    const err = new Error('amountPaisa must be a positive integer');
    err.statusCode = 400;
    throw err;
  }

  const summary = await getInvoiceOutstanding(invoiceId);

  if (amountPaisa > summary.outstandingPaisa) {
    const err = new Error(
      `Payment (${amountPaisa} paise) exceeds outstanding amount (${summary.outstandingPaisa} paise)`
    );
    err.statusCode = 409;
    throw err;
  }

  // Never edits the Invoice document
  return Payment.create({
    customer: summary.customerId,
    invoice: summary.invoiceId,
    amountPaisa,
    paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
    mode,
    referenceNo: referenceNo || ''
  });
}

async function getCustomerOutstanding(customerId) {
  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new Error('Invalid customer ID');
  }
  const customer = await Customer.findById(customerId).lean();
  if (!customer) throw new Error(`Customer not found: ${customerId}`);

  const [invAgg] = await Invoice.aggregate([
    { $match: { customer: customer._id } },
    { $group: { _id: null, invoicedPaisa: { $sum: '$totalPaisa' } } }
  ]);

  const [cnAgg] = await CreditNote.aggregate([
    { $match: { customer: customer._id } },
    { $group: { _id: null, creditNotesPaisa: { $sum: '$totalPaisa' } } } // negative values
  ]);

  const [payAgg] = await Payment.aggregate([
    { $match: { customer: customer._id } },
    { $group: { _id: null, paidPaisa: { $sum: '$amountPaisa' } } }
  ]);

  const invoicedPaisa = invAgg ? invAgg.invoicedPaisa : 0;
  const creditNotesPaisa = cnAgg ? cnAgg.creditNotesPaisa : 0;
  const paidPaisa = payAgg ? payAgg.paidPaisa : 0;
  const outstandingPaisa = invoicedPaisa + creditNotesPaisa - paidPaisa;

  return {
    customerId: customer._id,
    customerName: customer.name,
    invoicedPaisa,
    creditNotesPaisa,
    paidPaisa,
    outstandingPaisa
  };
}

module.exports = {
  recordPayment,
  getInvoiceOutstanding,
  getCustomerOutstanding
};
