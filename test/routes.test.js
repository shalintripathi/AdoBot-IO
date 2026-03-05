/**
 * Route integration tests — verifies that:
 *  1. Every admin route enforces auth (401 without credentials).
 *  2. Bot-facing routes do NOT require auth (accessible without credentials).
 *
 * All Sequelize model methods are stubbed so no MySQL connection is needed.
 */

var request = require('supertest');
var sinon   = require('sinon');
var express = require('express');
var bodyParser = require('body-parser');

// ── Models ────────────────────────────────────────────────────────────────────
var Bot        = require('../models/bot');
var Command    = require('../models/command');
var Message    = require('../models/message');
var CallLog    = require('../models/call_log');
var Contact    = require('../models/contact');
var Permission = require('../models/permission');

var VALID_USER = 'admin';
var VALID_PASS = 'admin';

function buildApp(sandbox) {
  // Stub every model method that any controller might call so routes never hit MySQL
  sandbox.stub(Bot,        'findAll').resolves([]);
  sandbox.stub(Bot,        'findOne').resolves(null);
  sandbox.stub(Bot,        'findById').resolves(null);
  sandbox.stub(Bot,        'create').resolves({ id: 1, uid: 'x' });
  sandbox.stub(Command,    'findAll').resolves([]);
  sandbox.stub(Command,    'findOne').resolves(null);
  sandbox.stub(Command,    'create').resolves({ id: 1, command: 'c', arg1: '', arg2: '', uid: 'x' });
  sandbox.stub(Command,    'destroy').resolves();
  sandbox.stub(Message,    'findAll').resolves([]);
  sandbox.stub(Message,    'create').resolves({});
  sandbox.stub(Message,    'destroy').resolves();
  sandbox.stub(CallLog,    'findAll').resolves([]);
  sandbox.stub(CallLog,    'create').resolves({});
  sandbox.stub(CallLog,    'destroy').resolves();
  sandbox.stub(Contact,    'findAll').resolves([]);
  sandbox.stub(Contact,    'create').resolves({});
  sandbox.stub(Contact,    'destroy').resolves();
  sandbox.stub(Permission, 'findAll').resolves([]);
  sandbox.stub(Permission, 'create').resolves({});
  sandbox.stub(Permission, 'destroy').resolves();

  var app = express();
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));

  // Mock socket.io instance — no socket connections
  var room = { emit: function() {} };
  var io = { to: function() { return room; }, sockets: { connected: {} } };

  require('../routes')(app, io);
  return app;
}

// ── Auth-protected admin routes ───────────────────────────────────────────────

describe('Admin routes require authentication', function() {

  var sandbox, app;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    app     = buildApp(sandbox);
  });

  afterEach(function() { sandbox.restore(); });

  var adminRoutes = [
    ['get',    '/bots'],
    ['get',    '/bots/1'],
    ['delete', '/bots/1'],
    ['post',   '/add-command'],
    ['get',    '/get-commands'],
    ['delete', '/commands/1'],
    ['delete', '/clear-messages/uid-x'],
    ['get',    '/get-messages/uid-x'],
    ['get',    '/call-logs/uid-x'],
    ['delete', '/call-logs/uid-x'],
    ['get',    '/permissions/uid-x'],
    ['get',    '/contacts/uid-x'],
    ['delete', '/contacts/uid-x']
  ];

  adminRoutes.forEach(function(pair) {
    var method = pair[0];
    var path   = pair[1];

    it(method.toUpperCase() + ' ' + path + ' → 401 without credentials', function() {
      return request(app)[method](path)
        .expect(401);
    });

    it(method.toUpperCase() + ' ' + path + ' → not 401 with valid credentials', function() {
      return request(app)[method](path)
        .set('username', VALID_USER)
        .set('password', VALID_PASS)
        .expect(function(res) {
          if (res.status === 401) {
            throw new Error('Expected non-401 with valid credentials, got 401');
          }
        });
    });
  });

  it('POST /login → 200 with correct credentials', function() {
    return request(app)
      .post('/login')
      .set('username', VALID_USER)
      .set('password', VALID_PASS)
      .expect(200);
  });

  it('POST /login → 401 with wrong credentials', function() {
    return request(app)
      .post('/login')
      .set('username', 'bad')
      .set('password', 'creds')
      .expect(401);
  });

});

// ── Bot-facing routes (no auth required) ─────────────────────────────────────

describe('Bot routes do not require authentication', function() {

  var sandbox, app;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    app     = buildApp(sandbox);
  });

  afterEach(function() { sandbox.restore(); });

  it('POST /status/:uid → not 401 without credentials', function() {
    return request(app)
      .post('/status/uid-x')
      .send({})
      .expect(function(res) {
        if (res.status === 401) throw new Error('Bot route should not require auth');
      });
  });

  it('POST /call-logs → not 401 without credentials', function() {
    return request(app)
      .post('/call-logs')
      .send({})
      .expect(function(res) {
        if (res.status === 401) throw new Error('Bot route should not require auth');
      });
  });

  it('POST /message → not 401 without credentials', function() {
    return request(app)
      .post('/message')
      .send({})
      .expect(function(res) {
        if (res.status === 401) throw new Error('Bot route should not require auth');
      });
  });

  it('POST /contacts → not 401 without credentials', function() {
    return request(app)
      .post('/contacts')
      .send({})
      .expect(function(res) {
        if (res.status === 401) throw new Error('Bot route should not require auth');
      });
  });

  it('GET /pending-commands → not 401 without credentials', function() {
    return request(app)
      .get('/pending-commands')
      .expect(function(res) {
        if (res.status === 401) throw new Error('Bot route should not require auth');
      });
  });

});
