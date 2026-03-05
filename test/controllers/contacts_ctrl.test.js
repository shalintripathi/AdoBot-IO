var expect  = require('chai').expect;
var sinon   = require('sinon');
var Contact = require('../../models/contact');

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

describe('contacts_ctrl#create', function() {

  var sandbox, io, ctrl;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    io   = mockIo();
    ctrl = require('../../controllers/contacts_ctrl')(io);
  });

  afterEach(function() { sandbox.restore(); });

  it('skips creation and returns 201 when contact already exists', function() {
    var existing = { id: 1, contact_id: 10 };
    sandbox.stub(Contact, 'findOne').resolves(existing);
    sandbox.stub(Contact, 'create').resolves({});

    var req = { body: { uid: 'u1', contact_id: '10', name: 'Alice' } };
    var res = mockRes();

    ctrl.create(req, res);
    return settle().then(function() {
      expect(Contact.create.called).to.be.false;
      expect(res.status.calledWith(201)).to.be.true;
    });
  });

  it('creates contact, emits contact:created, and returns 201 for new contact', function() {
    var created = { id: 2, contact_id: 20, name: 'Bob' };
    sandbox.stub(Contact, 'findOne').resolves(null);
    sandbox.stub(Contact, 'create').resolves(created);

    var req = { body: { uid: 'u2', contact_id: '20', name: 'Bob' } };
    var res = mockRes();

    ctrl.create(req, res);
    return settle().then(function() {
      expect(Contact.create.calledWith(req.body)).to.be.true;
      expect(io.to.calledWith('/admin')).to.be.true;
      expect(io.to().emit.calledWith('contact:created', created)).to.be.true;
      expect(res.status.calledWith(201)).to.be.true;
    });
  });

  it('responds 500 on DB error', function() {
    sandbox.stub(Contact, 'findOne').rejects(new Error('fail'));

    var req = { body: { uid: 'u3', contact_id: '30' } };
    var res = mockRes();

    ctrl.create(req, res);
    return settle().then(function() {
      expect(res.status.calledWith(500)).to.be.true;
    });
  });

  it('responds 500 when Contact.create fails', function() {
    sandbox.stub(Contact, 'findOne').resolves(null);
    sandbox.stub(Contact, 'create').rejects(new Error('insert fail'));

    var req = { body: { uid: 'u4', contact_id: '40' } };
    var res = mockRes();

    ctrl.create(req, res);
    return settle().then(function() {
      expect(res.status.calledWith(500)).to.be.true;
    });
  });

});

// ── getContacts ───────────────────────────────────────────────────────────────

describe('contacts_ctrl#getContacts', function() {

  var sandbox, io, ctrl;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    io   = mockIo();
    ctrl = require('../../controllers/contacts_ctrl')(io);
  });

  afterEach(function() { sandbox.restore(); });

  it('returns all contacts for a uid as JSON', function() {
    var contacts = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
    sandbox.stub(Contact, 'findAll').resolves(contacts);

    var req = { params: { uid: 'uid-x' } };
    var res = mockRes();

    ctrl.getContacts(req, res);
    return settle().then(function() {
      expect(res.json.calledWith(contacts)).to.be.true;
    });
  });

  it('responds 500 on DB error', function() {
    sandbox.stub(Contact, 'findAll').rejects(new Error('fail'));

    var req = { params: { uid: 'uid-x' } };
    var res = mockRes();

    ctrl.getContacts(req, res);
    return settle().then(function() {
      expect(res.status.calledWith(500)).to.be.true;
    });
  });

});

// ── clear ─────────────────────────────────────────────────────────────────────

describe('contacts_ctrl#clear', function() {

  var sandbox, io, ctrl;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    io   = mockIo();
    ctrl = require('../../controllers/contacts_ctrl')(io);
  });

  afterEach(function() { sandbox.restore(); });

  it('destroys all contacts for a uid and returns 200', function() {
    sandbox.stub(Contact, 'destroy').resolves();

    var req = { params: { uid: 'uid-y' } };
    var res = mockRes();

    ctrl.clear(req, res);
    return settle().then(function() {
      expect(Contact.destroy.calledWith({ where: { uid: 'uid-y' } })).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });
  });

  it('responds 500 on DB error', function() {
    sandbox.stub(Contact, 'destroy').rejects(new Error('fail'));

    var req = { params: { uid: 'uid-y' } };
    var res = mockRes();

    ctrl.clear(req, res);
    return settle().then(function() {
      expect(res.status.calledWith(500)).to.be.true;
    });
  });

});
