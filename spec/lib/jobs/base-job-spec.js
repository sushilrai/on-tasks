// Copyright 2015, Renasar Technologies Inc.
/* jshint node:true */

'use strict';

var events = require('events'),
    uuid = require('node-uuid'),
    util = require('util');

describe("Base Job", function () {
    var BaseJob;
    var MockJob;
    var base = require('./base-spec');

    base.before(function (context) {
        // create a child injector with on-core and the base pieces we need to test this
        helper.setupInjector([
            helper.require('/spec/mocks/logger.js'),
            helper.require('/lib/jobs/base-job.js')
        ]);

        helper.injector.get('Services.Messenger').subscribe = sinon.stub().returns(Q.resolve({}));

        context.Jobclass = helper.injector.get('Job.Base');
        BaseJob = context.Jobclass;

        var taskProtocol = helper.injector.get('Protocol.Task');
        var eventsProtocol = helper.injector.get('Protocol.Events');

        _.forEach(Object.getPrototypeOf(taskProtocol), function(f, funcName) {
            var spy = sinon.spy(function() {
                var deferred = Q.defer();
                process.nextTick(function() {
                    deferred.resolve(spy);
                });
                return deferred.promise;
            });
            spy.dispose = sinon.stub();
            spy.dispose = sinon.stub();
            taskProtocol[funcName] = spy;
        });
        _.forEach(Object.getPrototypeOf(eventsProtocol), function(f, funcName) {
            var spy = sinon.spy(function() {
                var deferred = Q.defer();
                process.nextTick(function() {
                    deferred.resolve(spy);
                });
                return deferred.promise;
            });
            spy.dispose = sinon.stub();
            spy.dispose = sinon.stub();
            eventsProtocol[funcName] = spy;
        });

        MockJob = function() {
            var logger = helper.injector.get('Logger').initialize(MockJob);
            MockJob.super_.call(this, logger, {}, {}, uuid.v4());
            this.nodeId = "54c69f87c7100ec77bfde17c";
            this.context = {};
            this.context.target = 'testtarget';
            this.graphId = uuid.v4();
        };

        util.inherits(MockJob, BaseJob);

        MockJob.prototype._run = sinon.stub();
    });

    base.examples();

    describe("", function() {
        it('should be an EventEmitter', function() {
            var job = new MockJob();
            expect(job).to.be.an.instanceof(events.EventEmitter);
        });
    });

    describe('Subscriptions', function() {
        it("should respond to activeTaskExists requests", function() {
            var job = new MockJob();
            var activeCallback;
            job._subscribeActiveTaskExists = function(callback) {
                activeCallback = callback;
                return Q.resolve();
            };
            job._run = sinon.stub();

            return job.run()
            .then(function() {
                expect(job._run.calledOnce).to.equal(true);
                expect(activeCallback).to.be.a.function;
                expect(activeCallback()).to.deep.equal(job.serialize());
            });
        });

        it("should call subclass _run()", function() {
            var job = new MockJob();
            job._run = sinon.stub();
            return job.run()
            .then(function() {
                expect(job._run.calledOnce).to.equal(true);
            });
        });

        it("should clean up on done", function(done) {
            var job = new MockJob();

            var numSubscriberMethods = 0;
            _.forEach(BaseJob.prototype, function(func, funcName) {
                if (funcName.indexOf('_subscribe') === 0) {
                    var stub = sinon.stub();
                    stub.bind = sinon.stub();
                    // Call all subscriber methods with appropriate arity, and
                    // the callback as the last argument
                    var args = _.range(job[funcName].length - 1);
                    job[funcName].apply(job, args.concat([stub]));
                    // Assert that we always bind the callback
                    expect(stub.bind).to.have.been.calledWith(job);
                    numSubscriberMethods += 1;
                }
            });

            expect(job.subscriptionPromises).to.have.length(numSubscriberMethods);
            expect(job.subscriptions).to.have.length(0);

            job.on('done', function() {
                _.forEach(job.subscriptions, function(subscription) {
                    try {
                        expect(subscription.dispose.calledOnce).to.equal(true);
                    } catch (e) {
                        done(e);
                    }
                });
                process.nextTick(function() {
                    // assert removeAllListeners() called
                    expect(job._events).to.be.empty;

                    done();
                });
            });

            Q.all(job.subscriptionPromises)
            .then(function() {
                expect(job.subscriptions).to.have.length(numSubscriberMethods);
                job._done();
            }).catch(function(error) {
                done(error);
            });
        });
    });
});