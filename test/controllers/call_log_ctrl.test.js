var expect  = require('chai').expect;
var sinon   = require('sinon');
var CallLog = require('../../models/call_log');

function mockRes() {
  var res = {};
  res.status = sinon.stub().returns(res);
  res.send   = sinon.stub().returns(res);
  res.json   = sinon.stub().returns(res);
  return res;
}

function mockIo() {
  var room = { emit: sinon.stub() };
  return { to: sinon.stub().returns(room) };
}

function settle(ms) {
  return new Promise(function(r) { setTimeout(r, ms || 20); });
}

// ── create ────────────────────────────────────────────────────────────────────

describe('call_log_ctrl#create', function() {

  var sandbox, io, ctrl;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    io   = mockIo();
    ctrl = require('../../controllers/call_log_ctrl')(io);
  });

  afterEach(function() { sandbox.restore(); });

  it('returns existing log as JSON when a duplicate is found', function() {
    var existing = { id: 1, call_id: 42 };
    sandbox.stub(CallLog, 'findOne').resolves(existing);
    sandbox.stub(CallLog, 'create').resolves({});

    var req = { body: { uid: 'u1', call_id: '42', type: '1', duration: '30',
                        name: 'Alice', date: 'now', phone: '123' } };
    var res = mockRes();

    ctrl.create(req, res);
    return settle().then(function() {
      expect(res.json.calledWith(existing)).to.be.true;
      expect(CallLog.create.called).to.be.false;
    });
  });

  it('creates a new log, emits call_log:created, and returns JSON when no duplicate', function() {
    var created = { id: 2, call_id: 99 };
    sandbox.stub(CallLog, 'findOne').resolves(null);
    sandbox.stub(CallLog, 'create').resolves(created);

    var req = { body: { uid: 'u2', call_id: '99', type: '2', duration: '60',
                        name: 'Bob', date: 'now', phone: '456' } };
    var res = mockRes();

    ctrl.create(req, res);
    return settle().then(function() {
      expect(CallLog.create.calledOnce).to.be.true;
      // verify numeric parsing
      var attrs = CallLog.create.firstCall.args[0];
      expect(attrs.call_id).to.equal(99);
      expect(attrs.type).to.equal(2);
      expect(attrs.duration).to.equal(60);
      expect(io.to.calledWith('/admin')).to.be.true;
      expect(io.to().emit.calledWith('call_log:created', created)).to.be.true;
      expect(res.json.calledWith(created)).to.be.true;
    });
  });

  it('responds 500 on DB error', function() {
    sandbox.stub(CallLog, 'findOne').rejects(new Error('db down'));

    var req = { body: { uid: 'u3', call_id: '1', type: '1', duration: '0',
                        name: 'X', date: 'now', phone: '0' } };
    var res = mockRes();

    ctrl.create(req, res);
    return settle().then(function() {
      expect(res.status.calledWith(500)).to.be.true;
    });
  });

});

// ── showLogs ──────────────────────────────────────────────────────────────────

describe('call_log_ctrl#showLogs', function() {

  var sandbox, io, ctrl;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    io   = mockIo();
    ctrl = require('../../controllers/call_log_ctrl')(io);
  });

  afterEach(function() { sandbox.restore(); });

  it('returns all call logs for a uid', function() {
    var logs = [{ id: 1 }, { id: 2 }];
    sandbox.stub(CallLog, 'findAll').resolves(logs);

    var req = { params: { uid: 'uid-x' } };
    var res = mockRes();

    ctrl.showLogs(req, res);
    return settle().then(function() {
      expect(res.json.calledWith(logs)).to.be.true;
    });
  });

  it('responds 500 on DB error', function() {
    sandbox.stub(CallLog, 'findAll').rejects(new Error('fail'));

    var req = { params: { uid: 'uid-x' } };
    var res = mockRes();

    ctrl.showLogs(req, res);
    return settle().then(function() {
      expect(res.status.calledWith(500)).to.be.true;
    });
  });

});

// ── clear ─────────────────────────────────────────────────────────────────────

describe('call_log_ctrl#clear', function() {

  var sandbox, io, ctrl;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    io   = mockIo();
    ctrl = require('../../controllers/call_log_ctrl')(io);
  });

  afterEach(function() { sandbox.restore(); });

  it('destroys logs, emits call_log:cleared, and returns 200', function() {
    sandbox.stub(CallLog, 'destroy').resolves();

    var req = { params: { uid: 'uid-y' } };
    var res = mockRes();

    ctrl.clear(req, res);
    return settle().then(function() {
      expect(CallLog.destroy.calledWith({ where: { uid: 'uid-y' } })).to.be.true;
      expect(io.to().emit.calledWith('call_log:cleared', { uid: 'uid-y' })).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });
  });

});
