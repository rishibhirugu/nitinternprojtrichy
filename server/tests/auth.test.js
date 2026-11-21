const jwt = require('jsonwebtoken');
const { requireAuth, requireRole, JWT_SECRET } = require('../middleware/auth');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('Auth & Role Middleware', () => {
  test('requireAuth returns 401 when Authorization header is missing', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('requireAuth attaches req.user and calls next for valid JWT', () => {
    const token = jwt.sign({ sub: 'u1', username: 'admin', role: 'ADMIN' }, JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);
    expect(req.user).toEqual({ id: 'u1', username: 'admin', role: 'ADMIN' });
    expect(next).toHaveBeenCalled();
  });

  test('requireRole returns 403 when user role is not allowed', () => {
    const req = { user: { id: 'u2', username: 'production', role: 'PRODUCTION' } };
    const res = mockRes();
    const next = jest.fn();

    requireRole('ADMIN', 'ACCOUNTANT')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('requireRole calls next when user role is allowed', () => {
    const req = { user: { id: 'u3', username: 'accountant', role: 'ACCOUNTANT' } };
    const res = mockRes();
    const next = jest.fn();

    requireRole('ADMIN', 'ACCOUNTANT')(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
