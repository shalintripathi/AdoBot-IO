var expect     = require('chai').expect;
var sinon      = require('sinon');
var permission = require('../../models/permission');

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

// ── updatePermissions ─────────────────────────────────────────────────────────

describe('permissions_ctrl#updatePermissions', function() {

  var sandbox, io, ctrl;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    io   = mockIo();
    ctrl = require('../../controllers/permissions_ctrl')(io);
  });

  afterEach(function() { sandbox.restore(); });

  it('destroys old perms, bulk-creates new ones, emits permissions:updated, returns 201', function() {
    sandbox.stub(permission, 'destroy').resolves();
    sandbox.stub(permission, 'bulkCreate').resolves();

    var req = {
      params: { uid: 'uid-a', device: 'Pixel' },
      body: { READ_SMS: '1', RECORD_AUDIO: '0', CAMERA: '1' }
    };
    var res = mockRes();

    ctrl.updatePermissions(req, res);
    return settle().then(function() {
      expect(permission.destroy.calledWith({ where: { uid: 'uid-a' } })).to.be.true;
      expect(permission.bulkCreate.calledOnce).to.be.true;

      var perms = permission.bulkCreate.firstCall.args[0];
      expect(perms).to.have.length(3);

      // verify granted conversion: '1'*1 != 0 → true, '0'*1 == 0 → false
      var readSms     = perms.find(function(p) { return p.permission === 'READ_SMS'; });
      var recordAudio = perms.find(function(p) { return p.permission === 'RECORD_AUDIO'; });
      var camera      = perms.find(function(p) { return p.permission === 'CAMERA'; });
      expect(readSms.granted).to.be.true;
      expect(recordAudio.granted).to.be.false;
      expect(camera.granted).to.be.true;

      // all carry the correct uid
      perms.forEach(function(p) { expect(p.uid).to.equal('uid-a'); });

      expect(io.to.calledWith('/admin')).to.be.true;
      expect(io.to().emit.calledWith('permissions:updated', sinon.match({
        uid: 'uid-a',
        device: 'Pixel'
      }))).to.be.true;
      expect(res.status.calledWith(201)).to.be.true;
    });
  });

  it('responds 500 when destroy fails', function() {
    sandbox.stub(permission, 'destroy').rejects(new Error('db error'));

    var req = { params: { uid: 'uid-b', device: 'X' }, body: {} };
    var res = mockRes();

    ctrl.updatePermissions(req, res);
    return settle().then(function() {
      expect(res.status.calledWith(500)).to.be.true;
    });
  });

  it('responds 500 when bulkCreate fails', function() {
    sandbox.stub(permission, 'destroy').resolves();
    sandbox.stub(permission, 'bulkCreate').rejects(new Error('bulk fail'));

    var req = { params: { uid: 'uid-c', device: 'Y' }, body: { CAMERA: '1' } };
    var res = mockRes();

    ctrl.updatePermissions(req, res);
    return settle().then(function() {
      expect(res.status.calledWith(500)).to.be.true;
    });
  });

  it('handles empty body (no permissions) — bulkCreate called with empty array', function() {
    sandbox.stub(permission, 'destroy').resolves();
    sandbox.stub(permission, 'bulkCreate').resolves();

    var req = { params: { uid: 'uid-d', device: 'Z' }, body: {} };
    var res = mockRes();

    ctrl.updatePermissions(req, res);
    return settle().then(function() {
      expect(permission.bulkCreate.firstCall.args[0]).to.deep.equal([]);
      expect(res.status.calledWith(201)).to.be.true;
    });
  });

});

// ── getPermissions ────────────────────────────────────────────────────────────

describe('permissions_ctrl#getPermissions', function() {

  var sandbox, io, ctrl;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    io   = mockIo();
    ctrl = require('../../controllers/permissions_ctrl')(io);
  });

  afterEach(function() { sandbox.restore(); });

  it('returns all permissions for a uid as JSON', function() {
    var perms = [{ permission: 'CAMERA', granted: true }];
    sandbox.stub(permission, 'findAll').resolves(perms);

    var req = { params: { uid: 'uid-x' } };
    var res = mockRes();

    ctrl.getPermissions(req, res);
    return settle().then(function() {
      expect(res.json.calledWith(perms)).to.be.true;
    });
  });

  it('responds 500 on DB error', function() {
    sandbox.stub(permission, 'findAll').rejects(new Error('fail'));

    var req = { params: { uid: 'uid-x' } };
    var res = mockRes();

    ctrl.getPermissions(req, res);
    return settle().then(function() {
      expect(res.status.calledWith(500)).to.be.true;
    });
  });

});
