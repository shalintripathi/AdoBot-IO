var expect = require('chai').expect;
var sinon  = require('sinon');

var Bot     = require('../../models/bot');
var Command = require('../../models/command');

function mockRes() {
  var res = {};
  res.status = sinon.stub().returns(res);
  res.send   = sinon.stub().returns(res);
  res.json   = sinon.stub().returns(res);
  return res;
}

function mockIo(socketMap) {
  var room = { emit: sinon.stub() };
  return {
    to: sinon.stub().returns(room),
    sockets: { connected: socketMap || {} }
  };
}

// ── formatCommand (tested indirectly via pendingCommands) ─────────────────────
// The internal formatCommand function is not exported, so we exercise it through
// the controller's HTTP handlers and verify the formatted strings produced.

describe('formatCommand (via pendingCommands)', function() {

  var sandbox, io, ctrl;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    io      = mockIo();
    ctrl    = require('../../controllers/commands_ctrl')(io);
  });

  afterEach(function() { sandbox.restore(); });

  function pendingResult(commandObj) {
    sandbox.stub(Command, 'findAll').resolves([commandObj]);
    var req = { query: { uid: 'any' } };
    var res = mockRes();
    ctrl.pendingCommands(req, res);
    return new Promise(function(resolve) { setTimeout(resolve, 20); }).then(function() {
      return res.json.firstCall.args[0][0].command;
    });
  }

  it('formats as cmd() when both arg1 and arg2 are empty strings', function() {
    return pendingResult({ id: 1, command: 'doThing', arg1: '', arg2: '' })
      .then(function(cmd) {
        expect(cmd).to.equal('doThing()\n');
      });
  });

  it('formats as cmd(arg2) when arg1 is falsy (null) and arg2 is present', function() {
    return pendingResult({ id: 2, command: 'doThing', arg1: null, arg2: 'beta' })
      .then(function(cmd) {
        expect(cmd).to.equal('doThing(beta)\n');
      });
  });

  it('formats as cmd(arg1) when arg2 is falsy (null) and arg1 is present', function() {
    return pendingResult({ id: 3, command: 'doThing', arg1: 'alpha', arg2: null })
      .then(function(cmd) {
        expect(cmd).to.equal('doThing(alpha)\n');
      });
  });

  it('formats as cmd(arg1, arg2) when both args are non-empty strings', function() {
    return pendingResult({ id: 4, command: 'doThing', arg1: 'alpha', arg2: 'beta' })
      .then(function(cmd) {
        expect(cmd).to.equal('doThing(alpha, beta)\n');
      });
  });

  it('treats arg1 = 0 (falsy number) as absent → uses arg2 branch', function() {
    // Demonstrates the loose-equality edge case: 0 is falsy so !arg1 is true,
    // even though arg1 == "" is false for the number 0. The arg2 branch fires.
    return pendingResult({ id: 5, command: 'cmd', arg1: 0, arg2: 'value' })
      .then(function(cmd) {
        expect(cmd).to.equal('cmd(value)\n');
      });
  });

});

// ── addCommand ────────────────────────────────────────────────────────────────

describe('commands_ctrl#addCommand', function() {

  var sandbox, io, ctrl;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
  });

  afterEach(function() { sandbox.restore(); });

  it('emits command directly to socket and returns 201 when bot is online', function() {
    var fakeSocket = { emit: sinon.stub() };
    io   = mockIo({ 'socket-123': fakeSocket });
    ctrl = require('../../controllers/commands_ctrl')(io);

    var dbBot = { status: true, socket_id: 'socket-123' };
    sandbox.stub(Bot,     'findOne').resolves(dbBot);
    sandbox.stub(Command, 'create').resolves({}); // must NOT be called

    var req = { body: { uid: 'uid-a', command: 'ring', arg1: '', arg2: '' } };
    var res = mockRes();

    ctrl.addCommand(req, res);

    return new Promise(function(resolve) { setTimeout(resolve, 20); }).then(function() {
      expect(fakeSocket.emit.calledWith('commands', [req.body])).to.be.true;
      expect(res.status.calledWith(201)).to.be.true;
      expect(Command.create.called).to.be.false; // must NOT persist
    });
  });

  it('returns 422 when bot is marked online but socket is not in connected map', function() {
    io   = mockIo({}); // empty connected map
    ctrl = require('../../controllers/commands_ctrl')(io);

    var dbBot = { status: true, socket_id: 'missing-socket' };
    sandbox.stub(Bot, 'findOne').resolves(dbBot);

    var req = { body: { uid: 'uid-b', command: 'ring', arg1: '', arg2: '' } };
    var res = mockRes();

    ctrl.addCommand(req, res);

    return new Promise(function(resolve) { setTimeout(resolve, 20); }).then(function() {
      expect(res.status.calledWith(422)).to.be.true;
    });
  });

  it('persists command to DB and emits command:added when bot is offline', function() {
    io   = mockIo({});
    ctrl = require('../../controllers/commands_ctrl')(io);

    var createdCmd = { id: 99, command: 'ring', arg1: '', arg2: '', uid: 'uid-c' };
    sandbox.stub(Bot,     'findOne').resolves(null); // bot not found / offline
    sandbox.stub(Command, 'create').resolves(createdCmd);

    var req = { body: { uid: 'uid-c', command: 'ring', arg1: '', arg2: '' } };
    var res = mockRes();

    ctrl.addCommand(req, res);

    return new Promise(function(resolve) { setTimeout(resolve, 20); }).then(function() {
      expect(Command.create.calledOnce).to.be.true;
      expect(io.to.calledWith('/admin')).to.be.true;
      expect(io.to().emit.calledWith('command:added', sinon.match({
        id: 99,
        command: 'ring()\n',
        uid: 'uid-c'
      }))).to.be.true;
      expect(res.json.calledWith(createdCmd)).to.be.true;
    });
  });

  it('returns 422 when offline-bot Command.create fails', function() {
    io   = mockIo({});
    ctrl = require('../../controllers/commands_ctrl')(io);

    sandbox.stub(Bot,     'findOne').resolves(null);
    sandbox.stub(Command, 'create').rejects(new Error('db error'));

    var req = { body: { uid: 'uid-d', command: 'ring', arg1: '', arg2: '' } };
    var res = mockRes();

    ctrl.addCommand(req, res);

    return new Promise(function(resolve) { setTimeout(resolve, 20); }).then(function() {
      expect(res.status.calledWith(422)).to.be.true;
    });
  });

});

// ── getCommands ───────────────────────────────────────────────────────────────

describe('commands_ctrl#getCommands', function() {

  var sandbox, io, ctrl;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    io      = mockIo();
    ctrl    = require('../../controllers/commands_ctrl')(io);
  });

  afterEach(function() { sandbox.restore(); });

  it('returns concatenated formatted commands and then destroys them', function() {
    var cmds = [
      { command: 'a', arg1: '', arg2: '' },
      { command: 'b', arg1: 'x', arg2: '' }
    ];
    sandbox.stub(Command, 'findAll').resolves(cmds);
    sandbox.stub(Command, 'destroy').resolves();

    var req = { query: { UID: 'uid-x' } };
    var res = mockRes();

    ctrl.getCommands(req, res);

    return new Promise(function(resolve) { setTimeout(resolve, 20); }).then(function() {
      expect(Command.destroy.calledOnce).to.be.true;
      var sent = res.send.firstCall.args[0];
      expect(sent).to.equal('a()\nb(x)\n');
      expect(io.to().emit.calledWith('commands:deleted', { uid: 'uid-x' })).to.be.true;
    });
  });

});

// ── delete ────────────────────────────────────────────────────────────────────

describe('commands_ctrl#delete', function() {

  var sandbox, io, ctrl;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    io      = mockIo();
    ctrl    = require('../../controllers/commands_ctrl')(io);
  });

  afterEach(function() { sandbox.restore(); });

  it('destroys command by id, returns 200, and emits command:deleted', function() {
    sandbox.stub(Command, 'destroy').resolves();

    var req = { params: { id: '7' } };
    var res = mockRes();

    ctrl.delete(req, res);

    return new Promise(function(resolve) { setTimeout(resolve, 20); }).then(function() {
      expect(Command.destroy.calledWith({ where: { id: '7' } })).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
      expect(io.to().emit.calledWith('command:deleted', { id: 7 })).to.be.true;
    });
  });

});
