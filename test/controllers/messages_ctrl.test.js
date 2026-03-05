var expect  = require('chai').expect;
var sinon   = require('sinon');
var message = require('../../models/message');
var bot     = require('../../models/bot');

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

describe('messages_ctrl#addMessage', function() {

  var sandbox, io, ctrl;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    // messages_ctrl does `console.log(bot)` on require — bot is already cached
    io   = mockIo();
    ctrl = require('../../controllers/messages_ctrl')(io);
  });

  afterEach(function() { sandbox.restore(); });

  it('returns existing message as JSON when it exists and name != UNKNOWN_CONTACT', function() {
    var existing = { id: 1, name: 'Alice', message_id: 5 };
    sandbox.stub(message, 'findOne').resolves(existing);
    sandbox.stub(message, 'create').resolves({});

    var req = { body: { uid: 'u1', message_id: '5', thread_id: '2', type: '1',
                        phone: '123', name: 'Alice', message: 'hi', date: 'now' } };
    var res = mockRes();

    ctrl.addMessage(req, res);
    return settle().then(function() {
      expect(res.json.calledWith(existing)).to.be.true;
      expect(message.create.called).to.be.false;
    });
  });

  it('creates a new message and emits message:created when none exists', function() {
    var created = { id: 2, uid: 'u1', name: 'Bob' };
    sandbox.stub(message, 'findOne').resolves(null);
    sandbox.stub(message, 'create').resolves(created);

    var req = { body: { uid: 'u1', message_id: '7', thread_id: '3', type: '2',
                        phone: '456', name: 'Bob', message: 'hey', date: 'now' } };
    var res = mockRes();

    ctrl.addMessage(req, res);
    return settle().then(function() {
      expect(message.create.calledOnce).to.be.true;
      expect(io.to.calledWith('/admin')).to.be.true;
      expect(io.to().emit.calledWith('message:created', created)).to.be.true;
      expect(res.status.calledWith(201)).to.be.true;
    });
  });

  it('creates a new message when existing record has name UNKNOWN_CONTACT', function() {
    var existing = { id: 3, name: 'UNKNOWN_CONTACT' };
    var created  = { id: 4, name: 'Carol' };
    sandbox.stub(message, 'findOne').resolves(existing);
    sandbox.stub(message, 'create').resolves(created);

    var req = { body: { uid: 'u2', message_id: '9', thread_id: '1', type: '1',
                        phone: '789', name: 'Carol', message: 'yo', date: 'now' } };
    var res = mockRes();

    ctrl.addMessage(req, res);
    return settle().then(function() {
      expect(message.create.calledOnce).to.be.true;
      expect(res.status.calledWith(201)).to.be.true;
    });
  });

  it('responds 500 on DB error', function() {
    sandbox.stub(message, 'findOne').rejects(new Error('db error'));

    var req = { body: { uid: 'u3', message_id: '1', thread_id: '1', type: '1',
                        phone: '0', name: 'X', message: 'm', date: 'd' } };
    var res = mockRes();

    ctrl.addMessage(req, res);
    return settle().then(function() {
      expect(res.status.calledWith(500)).to.be.true;
    });
  });

});

describe('messages_ctrl#getMessages', function() {

  var sandbox, io, ctrl;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    io   = mockIo();
    ctrl = require('../../controllers/messages_ctrl')(io);
  });

  afterEach(function() { sandbox.restore(); });

  it('returns all messages for a uid as JSON', function() {
    var msgs = [{ id: 1 }, { id: 2 }];
    sandbox.stub(message, 'findAll').resolves(msgs);

    var req = { params: { uid: 'uid-x' } };
    var res = mockRes();

    ctrl.getMessages(req, res);
    return settle().then(function() {
      expect(res.json.calledWith(msgs)).to.be.true;
    });
  });

  it('responds 500 on DB error', function() {
    sandbox.stub(message, 'findAll').rejects(new Error('fail'));

    var req = { params: { uid: 'uid-x' } };
    var res = mockRes();

    ctrl.getMessages(req, res);
    return settle().then(function() {
      expect(res.status.calledWith(500)).to.be.true;
    });
  });

});

describe('messages_ctrl#clearMessages', function() {

  var sandbox, io, ctrl;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    io   = mockIo();
    ctrl = require('../../controllers/messages_ctrl')(io);
  });

  afterEach(function() { sandbox.restore(); });

  it('destroys messages, emits messages:cleared, and returns 200', function() {
    sandbox.stub(message, 'destroy').resolves();

    var req = { params: { uid: 'uid-y' } };
    var res = mockRes();

    ctrl.clearMessages(req, res);
    return settle().then(function() {
      expect(message.destroy.calledWith({ where: { uid: 'uid-y' } })).to.be.true;
      expect(io.to().emit.calledWith('messages:cleared', { uid: 'uid-y' })).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });
  });

  it('responds 500 on DB error', function() {
    sandbox.stub(message, 'destroy').rejects(new Error('fail'));

    var req = { params: { uid: 'uid-y' } };
    var res = mockRes();

    ctrl.clearMessages(req, res);
    return settle().then(function() {
      expect(res.status.calledWith(500)).to.be.true;
    });
  });

});
