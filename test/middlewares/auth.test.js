var expect = require('chai').expect;
var sinon  = require('sinon');
var auth   = require('../../middlewares/auth');

// In development mode config.json has: username = "admin", password = "admin"
var VALID_USER = 'admin';
var VALID_PASS = 'admin';

describe('auth middleware', function() {

  var req, res, next;

  beforeEach(function() {
    req  = { headers: {}, body: {}, path: '/bots' };
    res  = { status: sinon.stub().returnsThis(), send: sinon.stub().returnsThis() };
    next = sinon.stub();
  });

  // ── 401 cases ──────────────────────────────────────────────────────────────

  it('returns 401 when no credentials are provided', function() {
    auth(req, res, next);
    expect(res.status.calledWith(401)).to.be.true;
    expect(res.send.called).to.be.true;
    expect(next.called).to.be.false;
  });

  it('returns 401 when the password is wrong', function() {
    req.headers['username'] = VALID_USER;
    req.headers['password'] = 'wrong';
    auth(req, res, next);
    expect(res.status.calledWith(401)).to.be.true;
    expect(next.called).to.be.false;
  });

  it('returns 401 when the username is wrong', function() {
    req.headers['username'] = 'wrong';
    req.headers['password'] = VALID_PASS;
    auth(req, res, next);
    expect(res.status.calledWith(401)).to.be.true;
    expect(next.called).to.be.false;
  });

  it('returns 401 when only body credentials are wrong', function() {
    req.body.username = 'bad';
    req.body.password = 'creds';
    auth(req, res, next);
    expect(res.status.calledWith(401)).to.be.true;
    expect(next.called).to.be.false;
  });

  // ── next() cases ───────────────────────────────────────────────────────────

  it('calls next() on an admin route with correct header credentials', function() {
    req.headers['username'] = VALID_USER;
    req.headers['password'] = VALID_PASS;
    auth(req, res, next);
    expect(next.calledOnce).to.be.true;
    expect(res.status.called).to.be.false;
  });

  it('calls next() when credentials are supplied via req.body', function() {
    req.body.username = VALID_USER;
    req.body.password = VALID_PASS;
    auth(req, res, next);
    expect(next.calledOnce).to.be.true;
  });

  it('prefers header credentials over body credentials', function() {
    req.headers['username'] = VALID_USER;
    req.headers['password'] = VALID_PASS;
    req.body.username = 'wrong';
    req.body.password = 'wrong';
    auth(req, res, next);
    expect(next.calledOnce).to.be.true;
  });

  // ── /login special case ────────────────────────────────────────────────────

  it('returns 200 (not next) on the /login path with valid credentials', function() {
    req.path = '/login';
    req.headers['username'] = VALID_USER;
    req.headers['password'] = VALID_PASS;
    auth(req, res, next);
    expect(res.status.calledWith(200)).to.be.true;
    expect(res.send.called).to.be.true;
    expect(next.called).to.be.false;
  });

  it('still returns 401 on /login with bad credentials', function() {
    req.path = '/login';
    req.headers['username'] = VALID_USER;
    req.headers['password'] = 'wrong';
    auth(req, res, next);
    expect(res.status.calledWith(401)).to.be.true;
    expect(next.called).to.be.false;
  });

});
