var expect = require('chai').expect;
var sinon  = require('sinon');

function mockRes() {
  var res = {};
  res.status = sinon.stub().returns(res);
  res.send   = sinon.stub().returns(res);
  return res;
}

function mockIo() {
  var room = { emit: sinon.stub() };
  return { to: sinon.stub().returns(room) };
}

describe('notifications_ctrl#notify', function() {

  var io, ctrl;

  beforeEach(function() {
    io   = mockIo();
    ctrl = require('../../controllers/notifications_ctrl')(io);
  });

  it('emits req.body.event to /admin with the full body and returns 200', function() {
    var req = { body: { event: 'sms:received', uid: 'abc', text: 'hello' } };
    var res = mockRes();

    ctrl.notify(req, res);

    expect(io.to.calledWith('/admin')).to.be.true;
    expect(io.to().emit.calledWith('sms:received', req.body)).to.be.true;
    expect(res.status.calledWith(200)).to.be.true;
    expect(res.send.called).to.be.true;
  });

  it('works with any arbitrary event name in the body', function() {
    var req = { body: { event: 'custom:event', data: 42 } };
    var res = mockRes();

    ctrl.notify(req, res);

    expect(io.to().emit.calledWith('custom:event', req.body)).to.be.true;
    expect(res.status.calledWith(200)).to.be.true;
  });

});
