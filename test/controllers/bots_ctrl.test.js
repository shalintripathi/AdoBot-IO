var expect = require('chai').expect;
var sinon  = require('sinon');

// ── Models ────────────────────────────────────────────────────────────────────
// Require models so we can stub their methods.  Sequelize creates the pool
// lazily (only on first query), so the require itself won't fail without MySQL.
var Bot        = require('../../models/bot');
var Message    = require('../../models/message');
var CallLog    = require('../../models/call_log');
var Command    = require('../../models/command');
var Contact    = require('../../models/contact');
var Permission = require('../../models/permission');

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('bots_ctrl', function() {

  var io, ctrl, sandbox;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    io      = mockIo();
    ctrl    = require('../../controllers/bots_ctrl')(io);
  });

  afterEach(function() {
    sandbox.restore();
  });

  // ── index ──────────────────────────────────────────────────────────────────

  describe('#index', function() {
    it('responds with JSON array of all bots', function() {
      var bots = [{ id: 1 }, { id: 2 }];
      sandbox.stub(Bot, 'findAll').resolves(bots);
      var req = {};
      var res = mockRes();

      ctrl.index(req, res);

      return Bot.findAll.returnValues[0].then(function() {
        expect(res.json.calledWith(bots)).to.be.true;
      });
    });

    it('responds 500 when the DB throws', function() {
      sandbox.stub(Bot, 'findAll').rejects(new Error('db error'));
      var req = {};
      var res = mockRes();

      ctrl.index(req, res);

      return Bot.findAll.returnValues[0].catch(function() {}).then(function() {
        // give the promise chain time to settle
        return new Promise(function(resolve) { setTimeout(resolve, 10); });
      }).then(function() {
        expect(res.status.calledWith(500)).to.be.true;
      });
    });
  });

  // ── show ───────────────────────────────────────────────────────────────────

  describe('#show', function() {
    it('responds with a single bot by id', function() {
      var bot = { id: 42, uid: 'abc' };
      sandbox.stub(Bot, 'findById').resolves(bot);
      var req = { params: { id: '42' } };
      var res = mockRes();

      ctrl.show(req, res);

      return Bot.findById.returnValues[0].then(function() {
        expect(res.json.calledWith(bot)).to.be.true;
      });
    });

    it('responds 500 on DB error', function() {
      sandbox.stub(Bot, 'findById').rejects(new Error('not found'));
      var req = { params: { id: '99' } };
      var res = mockRes();

      ctrl.show(req, res);

      return new Promise(function(resolve) { setTimeout(resolve, 10); }).then(function() {
        expect(res.status.calledWith(500)).to.be.true;
      });
    });
  });

  // ── updateStatus ───────────────────────────────────────────────────────────

  describe('#updateStatus', function() {
    it('creates a new bot and emits bot:created when UID is unknown', function() {
      var createdBot = { id: 1, uid: 'new-uid', status: true };
      sandbox.stub(Bot, 'findOne').resolves(null);
      sandbox.stub(Bot, 'create').resolves(createdBot);

      var req = { params: { uid: 'new-uid' }, body: { device: 'Pixel' } };
      var res = mockRes();

      ctrl.updateStatus(req, res);

      return new Promise(function(resolve) { setTimeout(resolve, 20); }).then(function() {
        expect(Bot.create.called).to.be.true;
        var createArgs = Bot.create.firstCall.args[0];
        expect(createArgs.status).to.be.true;
        expect(createArgs.uid).to.equal('new-uid');
        expect(io.to.calledWith('/admin')).to.be.true;
        expect(io.to().emit.calledWith('bot:created', createdBot)).to.be.true;
        expect(res.status.calledWith(201)).to.be.true;
      });
    });

    it('updates an existing bot and emits bot:updated when UID is known', function() {
      var updatedBot = { id: 5, uid: 'existing-uid', status: true };
      var dbBot = { update: sinon.stub().resolves(updatedBot) };
      sandbox.stub(Bot, 'findOne').resolves(dbBot);

      var req = { params: { uid: 'existing-uid' }, body: { device: 'Pixel' } };
      var res = mockRes();

      ctrl.updateStatus(req, res);

      return new Promise(function(resolve) { setTimeout(resolve, 20); }).then(function() {
        expect(dbBot.update.called).to.be.true;
        var updateArgs = dbBot.update.firstCall.args[0];
        expect(updateArgs.status).to.be.true;
        expect(io.to().emit.calledWith('bot:updated', updatedBot)).to.be.true;
        expect(res.status.calledWith(200)).to.be.true;
      });
    });

    it('sets status=true and updated on every call', function() {
      sandbox.stub(Bot, 'findOne').resolves(null);
      sandbox.stub(Bot, 'create').resolves({ id: 1 });

      var req = { params: { uid: 'uid-x' }, body: {} };
      var res = mockRes();

      ctrl.updateStatus(req, res);

      return new Promise(function(resolve) { setTimeout(resolve, 20); }).then(function() {
        var attrs = Bot.create.firstCall.args[0];
        expect(attrs.status).to.be.true;
        expect(attrs.updated).to.be.instanceOf(Date);
      });
    });

    it('responds 500 when findOne rejects', function() {
      sandbox.stub(Bot, 'findOne').rejects(new Error('db down'));

      var req = { params: { uid: 'uid-x' }, body: {} };
      var res = mockRes();

      ctrl.updateStatus(req, res);

      return new Promise(function(resolve) { setTimeout(resolve, 20); }).then(function() {
        expect(res.status.calledWith(500)).to.be.true;
      });
    });
  });

  // ── delete ─────────────────────────────────────────────────────────────────

  describe('#delete', function() {
    it('cascades deletion across all related tables and responds 200', function() {
      var dbBot = { uid: 'del-uid', destroy: sinon.stub().resolves() };
      sandbox.stub(Bot,        'findOne').resolves(dbBot);
      sandbox.stub(Message,    'destroy').resolves();
      sandbox.stub(CallLog,    'destroy').resolves();
      sandbox.stub(Command,    'destroy').resolves();
      sandbox.stub(Contact,    'destroy').resolves();
      sandbox.stub(Permission, 'destroy').resolves();

      var req = { params: { id: '1' } };
      var res = mockRes();

      ctrl.delete(req, res);

      return new Promise(function(resolve) { setTimeout(resolve, 30); }).then(function() {
        expect(dbBot.destroy.calledOnce).to.be.true;
        expect(Message.destroy.calledOnce).to.be.true;
        expect(CallLog.destroy.calledOnce).to.be.true;
        expect(Command.destroy.calledOnce).to.be.true;
        expect(Contact.destroy.calledOnce).to.be.true;
        expect(Permission.destroy.calledOnce).to.be.true;
        expect(res.status.calledWith(200)).to.be.true;
      });
    });

    it('responds 500 when the bot is not found', function() {
      sandbox.stub(Bot, 'findOne').resolves(null);

      var req = { params: { id: '999' } };
      var res = mockRes();

      ctrl.delete(req, res);

      return new Promise(function(resolve) { setTimeout(resolve, 20); }).then(function() {
        expect(res.status.calledWith(500)).to.be.true;
      });
    });

    it('responds 500 when destroy throws', function() {
      var dbBot = { uid: 'uid', destroy: sinon.stub().rejects(new Error('fail')) };
      sandbox.stub(Bot, 'findOne').resolves(dbBot);

      var req = { params: { id: '1' } };
      var res = mockRes();

      ctrl.delete(req, res);

      return new Promise(function(resolve) { setTimeout(resolve, 20); }).then(function() {
        expect(res.status.calledWith(500)).to.be.true;
      });
    });
  });

});
