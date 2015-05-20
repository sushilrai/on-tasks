// Copyright 2014-2015, Renasar Technologies Inc.
/* jshint node: true */

'use strict';

var di = require('di'),
    util = require('util');

module.exports = ipmiObmServiceFactory;

di.annotate(ipmiObmServiceFactory, new di.Provide('ipmi-obm-service'));
di.annotate(ipmiObmServiceFactory, new di.Inject('OBM.base', 'Q', 'Services.Encryption'));

function ipmiObmServiceFactory(BaseObmService, Q, encryption) {
    function IpmiObmService(options) {
        BaseObmService.call(this, options);
        this.requiredKeys = ['password', 'host', 'user'];
    }
    util.inherits(IpmiObmService, BaseObmService);

    IpmiObmService.prototype.identifyOn = function() {
        return this._runInternal(['chassis', 'identify', 'force']);
    };

    IpmiObmService.prototype.identifyOff = function() {
        return this._runInternal(['chassis', 'identify', '0']);
    };

    IpmiObmService.prototype.reboot = function() {
        return this._runInternal(['chassis', 'power', 'cycle']);
    };

    IpmiObmService.prototype.powerOn = function() {
        return this._runInternal(['chassis', 'power', 'on']);
    };

    IpmiObmService.prototype.powerOff = function() {
        return this._runInternal(['chassis', 'power', 'off']);
    };

    IpmiObmService.prototype.powerStatus = function() {
        return this._runInternal(['chassis', 'power', 'status']).then(function (result) {
            if (result && result.stdout) {
                return Q.resolve(result.stdout.indexOf('Chassis Power is on') >= 0);
            } else {
                return Q.reject(
                    new Error('Unable to determine power state (' + result.stdout + ').')
                );
            }
        });
    };

    IpmiObmService.prototype.setBootPxe = function() {
        return this._runInternal(['chassis', 'bootdev', 'pxe']);
    };

    // Soft off via ACPI
    //
    // From the ipmitool man page:
    // "Initiate a soft-shutdown of OS via ACPI.  // This can be done in a
    //  number of ways, commonly by simulating an overtemperture or by
    //  simulating a power button press.  It is necessary for there
    //  to be Operating System support for ACPI and some sort of daemon
    //  watching for events for this soft power to work."
    IpmiObmService.prototype.soft = function() {
        return this._runInternal(['chassis', 'power', 'soft']);
    };

    IpmiObmService.prototype.reset = function() {
        return this._runInternal(['chassis', 'power', 'reset']);
    };

    IpmiObmService.prototype._runInternal = function (subcommand) {
        return this.run({
            command: 'ipmitool',
            args: [
                '-U', this.options.config.user,
                '-P', encryption.decrypt(this.options.config.password),
                '-H', this.options.config.host
            ].concat(subcommand),
            retries: this.options.retries,
            delay: this.options.delay
        });
    };

    IpmiObmService.create = function(options) {
        return BaseObmService.create(IpmiObmService, options);
    };

    return IpmiObmService;
}