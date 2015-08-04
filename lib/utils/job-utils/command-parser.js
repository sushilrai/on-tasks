// Copyright 2014, Renasar Technologies Inc.
// Created by ben broderick phillips on 8/28/14.
// *** KEEP ONLY THOSE THAT ARE APPLICABLE HERE AND SET TO TRUE ***
/* jshint node: true, -W064 */

'use strict';

var di = require('di'),
    xmlParser = require('xml2js').parseString;

module.exports = commandParserFactory;

di.annotate(commandParserFactory, new di.Provide('JobUtils.CommandParser'));
di.annotate(commandParserFactory, new di.Inject('Logger', 'Promise', '_'));
function commandParserFactory(Logger, Promise, _) {
    var logger = Logger.initialize(commandParserFactory);

    function CommandParser() { }

    // -------- commands ----------
    var ohai = 'sudo /opt/chef/bin/ohai --directory /etc/ohai/plugins',
        dmi = 'sudo dmidecode',
        megaraidControllerCount = 'sudo /opt/MegaRAID/storcli/storcli64 show ctrlcount J',
        megaraidAdapterInfo = 'sudo /opt/MegaRAID/storcli/storcli64 /c0 show all J',
        megaraidDriveInfo = 'sudo /opt/MegaRAID/storcli/storcli64 /c0 /eall /sall show J',
        megaraidVirtualDiskInfo = 'sudo /opt/MegaRAID/storcli/storcli64 /c0 /vall show all J',
        mpt2fusionAdapterInfo = 'sudo /opt/mpt/mpt2fusion/sas2flash -s -list',
        mellanoxInfo = 'sudo mlxfwmanager --query-xml',
        lshw = 'sudo lshw -json',
        lspci = 'sudo lspci -nn -vmm',
        lsscsiPlusRotational = 'sudo lsblk -o KNAME,TYPE,ROTA; echo BREAK; sudo lsscsi --size',
        ipmiMcInfo = 'sudo ipmitool mc info',
        ipmiSelInformation = 'sudo ipmitool sel',
        ipmiSel = 'sudo ipmitool sel list -c',
        ipmiFru = 'sudo ipmitool fru',
        testEsesR = 'sudo test_eses -R --xml',
        testEsesQ = 'sudo test_eses -q std --xml',
        amiBios = 'cd /opt/ami; sudo ./afulnx_64 /S',
        flashupdt = 'sudo /opt/intel/flashupdt -i',
        smart = 'sudo /opt/scripts/get_smart.sh';

    var matchParsers = {};
    matchParsers.ipmiUserList = {
        regex: /^sudo ipmitool -c user list \d+$/,
        parsefunction: function (data) {
            var channel = data.cmd.match(/\d+/);
            var userListSource = 'ipmi-user-list';
            if (channel) {
                if (channel[0] === '3') {
                    userListSource = 'rmm-user-list';
                } else {
                    userListSource = userListSource + '-' + channel;
                }
            }
            if (data.error) {
                // We catalog all 15 channels, only really fail if the first
                // one isn't present
                if (channel && channel[0] !== '1') {
                    return Promise.resolve({ source: userListSource, data: '', store: false });
                } else {
                    return Promise.resolve({ source: userListSource, error: data.error });
                }
            }
            try {
                var lines = data.stdout.split('\n');
                _.remove(lines, function (line) {
                    if (!line) {
                        return true;
                    } else {
                        return false;
                    }
                });
                var parsed = {},
                    header = lines.shift().split(','),
                    columns = _.map(lines, function (line) {
                        return line.split(',');
                    });
                var ids = _.map(lines, function (line) {
                    return line.split(',')[0];
                });
                var i = 0;
                _.forEach(ids, function (id) {
                    _.forEach(header, function (title) {
                        parsed[id] = parsed[id] || {};
                        parsed[id][title] = columns[i].shift();
                    });
                    i += 1;
                });

                var store = true;
                return Promise.resolve({data: parsed, source: userListSource, store: store});
            } catch (e) {
                return Promise.resolve({source: userListSource, error: e});
            }
        }
    };

    matchParsers.ipmiUserSummary = {
        regex: /^sudo ipmitool user summary \d+$/,
        parsefunction: function(data) {
            var channel = data.cmd.match(/\d+/);
            var userSummarySource = 'ipmi-user-summary';
            if (channel) {
                if (channel[0] === '3') {
                    userSummarySource = 'rmm-user-summary';
                } else {
                    userSummarySource = userSummarySource + '-' + channel;
                }
            }
            if (data.error) {
                // We catalog all 15 channels, only really fail if the first
                // one isn't present
                if (channel && channel[0] !== '1') {
                    return Promise.resolve({ source: userSummarySource, data: '', store: false });
                } else {
                    return Promise.resolve({ source: userSummarySource, error: data.error });
                }
            }
            try {
                var split = data.stdout.split('\n');
                _.remove(split, function(line) {
                    if (!line) {
                        return true;
                    } else if (line.indexOf(' : ') === -1) {
                        logger.warning("ipmitool parser: ignoring line " + line);
                        return true;
                    } else {
                        return false;
                    }
                });
                split = _.map(split, function(line) {
                    var sep = line.split(' : ');
                    sep[0] = sep[0].trim();
                    sep[1] = sep[1].trim();
                    return sep;
                });
                var parsed = {};
                _.forEach(split, function(line) {
                    parsed[line[0]] = line[1];
                });

                var store = true;
                return Promise.resolve({ data: parsed, source: userSummarySource, store: store });
            } catch (e) {
                return Promise.resolve({ source: userSummarySource, error: e });
            }
        }
    };

    matchParsers.ipmiLanPrint = {
        regex: /^sudo ipmitool lan print\s?\d?\d?$/,
        parsefunction: function(data) {
            var channel = data.cmd.match(/\d+/);
            var bmcsource = 'bmc';
            if (channel) {
                if (channel[0] === '3') {
                    bmcsource = 'rmm';
                } else {
                    bmcsource = bmcsource + '-' + channel;
                }
            }
            if (data.error) {
                // We catalog all 15 channels, only really fail if the first
                // one isn't present
                if (channel && channel[0] !== '1') {
                    return Promise.resolve({ source: bmcsource, data: '', store: false });
                } else {
                    return Promise.resolve({ source: bmcsource, error: data.error });
                }
            }
            try {
                var split = data.stdout.split('\n');
                _.remove(split, function(line) {
                    if (!line) {
                        return true;
                    } else if (line.indexOf(' : ') === -1) {
                        logger.warning("ipmitool parser: ignoring line " + line);
                        return true;
                    } else {
                        return false;
                    }
                });
                split = _.map(split, function(line) {
                    var sep = line.split(' : ');
                    sep[0] = sep[0].trim();
                    sep[1] = sep[1].trim();
                    return sep;
                });
                var parsed = {};
                _.forEach(split, function(line) {
                    if (line.length === 3) {
                        if (line[0] === 'Auth Type Enable') {
                            parsed['Auth Type Enable'] = parsed['Auth Type Enable'] || {};
                            parsed['Auth Type Enable'][line[1]] = line[2];
                        } else if (line[0] === '' && _.has(parsed, 'Auth Type Enable')) {
                            parsed['Auth Type Enable'][line[1]] = line[2];
                        } else {
                            logger.warning("Skipping subsection of IPMI data: " + line);
                        }
                    } else if (line[0] === 'Cipher Suite Priv Max') {
                        parsed['Cipher Suite Priv Max'] = parsed['Cipher Suite Priv Max'] || [];
                        parsed['Cipher Suite Priv Max'].push(line[1]);
                    } else if (line[0] === '' && _.has(parsed, 'Cipher Suite Priv Max')) {
                        parsed['Cipher Suite Priv Max'].push(line[1]);
                    } else {
                        parsed[line[0]] = line[1];
                    }
                });

                var store = (parsed['MAC Address'] !== '00:00:00:00:00:00');
                return Promise.resolve({ data: parsed, source: bmcsource, store: store });
            } catch (e) {
                return Promise.resolve({ source: bmcsource, error: e });
            }
        }
    };


    // -------- parsers ----------
    CommandParser.prototype[ohai] = function(data) {
        if (data.error) {
            return Promise.resolve({ source: 'ohai', error: data.error });
        }
        try {
            var parsed = JSON.parse(data.stdout);
            return Promise.resolve({ data: parsed, source: 'ohai', store: true });
        } catch (e) {
            return Promise.resolve({ source: 'ohai', error: e });
        }
    };

    CommandParser.prototype[smart] = function(data) {
        if (data.error) {
            return Promise.resolve({ source: 'smart', error: data.error });
        }
        try {
            var parsed = [];
            var splitData = data.stdout.split(/^#{4,}\s*([^\n\r]+)[\r\n]+/m);

            var drive = {'OS Device Name' : '', 'smartctl Version' : '', 'SMART' : []};
            _.forEach(splitData, function(elem) {
                if (elem === '') {
                    return;
                }
                else if (elem[0] === '/' ) { //This is the device name
                    drive['OS Device Name'] = elem;
                }
                else { //this is the smart data for above device
                    //extract the smartctl version
                    var ver = elem.match(/^smartctl\s([\d\.]+)/);
                    if (ver && ver.length > 1) {
                        drive['smartctl Version'] = ver[1];
                    }

                    drive.SMART = _parseSmartOneDriveData(elem);
                    parsed.push(drive);
                    drive = {'OS Device Name' : '', 'smartctl Version' : '', 'SMART' : []};
                }
          });

          return Promise.resolve({ data: parsed, source: 'smart', store: true });
        } catch (e) {
            return Promise.resolve({ source: 'smart', error: e });
        }
    };

    CommandParser.prototype[dmi] = function(data) {
        if (data.error) {
            return Promise.resolve({ source: 'dmi', error: data.error });
        }
        try {
            // Slice head of file until first 'Handle...' entry and
            // tail of file to before 'End Of Table'
            var lines = data.stdout.split('\n');
            var start = _.findIndex(lines, function(line) {
                return line.startsWith('Handle');
            });
            var end = _.findLastIndex(lines, function(line) {
                return line === 'End Of Table';
            });
            lines = lines.slice(start, end);

            var key = null;
            var subKey = null;
            var curr;
            var parsed = _.transform(lines, function(result, line) {
                if (line.startsWith('Handle')) {
                    /* Skip lines that look like:
                     *
                     * Handle 0x0012, DMI type 8, 9 bytes
                     */
                    return;
                } else if (!line) {
                    /* Along with the !key block below, handle cases where we
                     * have a break between top-level items:
                     *
                     * Handle 0x0012, DMI type 8, 9 bytes
                     * Port Connector Information
                     *         Internal Reference Designator: J3A1
                     *
                     * Handle 0x0013, DMI type 8, 9 bytes
                     * Port Connector Information
                     *         Internal Reference Designator: J3A1
                     */
                    key = null;
                } else if (!key) {
                    // See comments on previous conditional block
                    key = line.trim();
                    /* If this key already exists, that means we have duplicate keys,
                     * so we should change to an array of objects, e.g. with:
                     *
                     * Handle 0x0012, DMI type 8, 9 bytes
                     * Port Connector Information
                     *         Internal Reference Designator: J3A1
                     *
                     * Handle 0x0013, DMI type 8, 9 bytes
                     * Port Connector Information
                     *         Internal Reference Designator: J3A1
                     *
                     * We want the result to be:
                     *     result['Port Connector Information'] = [ { ... } , { ... } ]
                     *
                     * All _.isArray checks in below blocks accomodate this case as well.
                     */
                    if (_.has(result, key)) {
                        if (_.isArray(result[key])) {
                            result[key].push({});
                        } else {
                            result[key] = [result[key], {}];
                        }
                    } else {
                        result[key] = {};
                    }
                } else if (_.last(line) === ':') {
                    /* Handle cases where we have a subkey that is an array of items,
                     * as in 'Characteristics' below:
                     *
                     * BIOS Information
                     *         Characteristics:
                     *                 PCI is supported
                     *                 BIOS is upgradeable
                     */
                    subKey = line.split(':')[0].trim();
                    if (_.isArray(result[key])) {
                        curr = _.last(result[key]);
                        curr[subKey] = [];
                    } else {
                        result[key][subKey] = [];
                    }
                } else if (line[0] !== '\s' && line[0] !== '\t') {
                    /* Handle cases where we don't have a blank line in between
                     * top level categories:
                     *
                     * On Board Device 1 Information
                     *         Type: Video
                     * On Board Device 2 Information
                     *         Type: Ethernet
                     */
                    key = line.trim();
                    result[key] = {};
                } else {
                    /* Handle sub-objects and sub-arrays
                     *
                     * Cache Information
                     *         Socket Designation: L2 Cache
                     *         Supported SRAM Types:
                     *                 Unknown
                     *         Installed SRAM Type: Unknown
                     */
                    var split = line.split(':');
                    if (split.length === 1) {
                        if (_.isArray(result[key])) {
                            curr = _.last(result[key]);
                            curr[subKey].push(split[0].trim());
                        } else {
                            /* Handle corner case where the value looks like
                             * an object initially, but is actually an array
                             * with a pre-specified length. In this case,
                             * ditch the length value and just provide an array.
                             *
                             * Examples include 'Installable Languages' and 'Contained Elements':
                             *
                             * BIOS Language Information
                             *         Language Description Format: Long
                             *         Installable Languages: 1
                             *                 en|US|iso8859-1
                             *         Currently Installed Language: en|US|iso8859-1
                             *
                             *  ---
                             *
                             * Chassis Information
                             *     Contained Elements: 1
                             *         <OUT OF SPEC> (0)
                             *     SKU Number: To be filled by O.E.M.
                             *
                             */
                            if (parseInt(result[key][subKey])) {
                                result[key][subKey] = [];
                            }
                            result[key][subKey].push(split[0].trim());
                        }
                    } else {
                        subKey = split[0].trim();
                        if (_.isArray(result[key])) {
                            curr = _.last(result[key]);
                            curr[subKey] = split[1].trim();
                        } else {
                            result[key][subKey] = split[1].trim();
                        }
                    }
                }
            }, {});

            return Promise.resolve({ data: parsed, source: 'dmi', store: true });
        } catch (e) {
            return Promise.reject({ source: 'dmi', error: e });
        }
    };

    CommandParser.prototype[flashupdt] = function(data) {
        if (data.error) {
            return Promise.resolve({ source: 'flashupdt', error: data.error });
        }
        try {
            // Slice head of file until first 'BIOS Version Information' entry and
            // tail of file to before 'Successfully Completed'
            var lines = data.stdout.split('\n');
            var start = _.findIndex(lines, function(line) {
                return line.startsWith('BIOS Version Information');
            });
            var end = _.findLastIndex(lines, function(line) {
                return line === 'Successfully Completed';
            });
            lines = lines.slice(start, end);

            var key = null;
            var subkey = null;
            var split = null;
            var parsed = _.transform(lines, function(result, line) {
                if (line.startsWith('------')) {
                    // Skip lines that look like "------"
                    return;
                } else if (line) {
                    // Handle lines which is not empty, empty line is skipped
                    if (line.match(/^\s+/)) {
                        // Handle subkey cases started with at least one space
                        // delimiter is ":...." (at least one '.')
                        split = line.split(/:\.+/);
                        subkey = split[0].trim();
                        if (split.length === 2) {
                            result[key][subkey] = split[1].trim();
                        } else if (split.length === 1) {
                            result[key][subkey] = '';
                        }
                    } else {
                        if (_.last(line.trim()) === ':') {
                            /* Handle key cases with subkeys followed, like:
                             * System Information:
                             * ----------------------
                             *    Manufacturer Name:. EMC
                             */
                            key = line.split(':')[0];
                            result[key] = {};
                        } else {
                            // Handle key cases without subkeys
                            split = line.split(/:\.+/);
                            key = split[0].trim();
                            if (split.length === 2) {
                                result[key] = split[1].trim();
                            } else if (split.length === 1) {
                                result[key] = '';
                            }
                        }
                    }
                }
            },{});

            return Promise.resolve({ data: parsed, source: 'flashupdt', store: true });
        } catch (e) {
            return Promise.reject({ source: 'flashupdt', error: e });
        }
    };

    CommandParser.prototype[lshw] = function(data) {
        if (data.error) {
            return Promise.resolve({ source: 'lshw', error: data.error });
        }

        return Promise.resolve()
        .then(function() {
            return JSON.parse(data.stdout);
        })
        .then(function(parsed) {
            // Grab any mac addresses out of lshw output, and return them in a
            // lookups object, which will be used to populate the lookups
            // collection in the DB.
            var pci = _.find(parsed.children[0].children, function(child) {
                return child.id.startsWith('pci');
            });
            var macs = _.compact(_.map(pci.children, function(child) {
                if (child.id === 'network') {
                    return child.serial;
                }
                if (child.id.startsWith('pci')) {
                    return _.compact(_.map(child.children, function(_child) {
                        if (_child.class === 'network') {
                            return _child.serial;
                        }
                    }));
                }
            }));
            var lookups = _.map(_.flatten(macs), function(mac) {
                return { mac: mac };
            });
            return Promise.resolve({ data: parsed, source: 'lshw', store: true, lookups: lookups });
        })
        .catch(function(e) {
            return Promise.resolve({ source: 'lshw', error: e });
        });
    };

    CommandParser.prototype[lspci] = function(data) {
        if (data.error) {
            return Promise.resolve({ source: 'lspci', error: data.error });
        }
        try {
            var lines = data.stdout.split('\n\n');
            var parsed = _.map(lines, function(line) {
                var split = line.split('\n');
                return _.transform(split, function(result, pair) {
                    var sep = pair.split(/:[\t\s]?/, 2);
                    result[sep[0]] = sep[1];
                }, {});
            });
            return Promise.resolve({ data: parsed, source: 'lspci', store: true });
        } catch (e) {
            return Promise.resolve({ source: 'lspci', error: e });
        }
    };

    CommandParser.prototype[lsscsiPlusRotational] = function(data) {
        if (data.error) {
            return Promise.resolve({ source: 'lsscsi', error: data.error });
        }
        try {
            var lines = data.stdout.trim().split('\n');
            // Remove KNAME,ROTA header from lsblk output
            lines.shift();
            var lsblk = true;
            var split;
            var rotationalData = {};
            var parsed = _.compact(_.map(lines, function(line) {
                if (line === 'BREAK') {
                    lsblk = false;
                } else if (lsblk) {
                    // Grab rotational data information

                    split = line.replace(/\s+/g, ',').split(',');
                    // Our current overlay version of lsblk does not support the
                    // --scsi flag, otherwise we could just use that instead
                    // of checking the TYPE field
                    if (split[1] === 'disk') {
                        rotationalData[split[0]] = Boolean(parseInt(split[2]));
                    }
                } else {
                    // Grab lsscsi information

                    split = _.compact(line.split(' '));
                    if (split.length === 8) {
                        split[3] = split[3] + ' ' + split[4];
                        split = split.slice(0, 4).concat(split.slice(5, split.length));
                    }

                    var curr = {
                        scsiInfo: split[0],
                        peripheralType: split[1],
                        vendorName: split[2],
                        modelName: split[3],
                        revisionString: split[4],
                        devicePath: split[5],
                        size: split[6]
                    };

                    var device = _.last(curr.devicePath.split('/'));
                    if (_.has(rotationalData, device)) {
                        curr.rotational = rotationalData[device];
                    }

                    return curr;
                }
            }));

            return Promise.resolve({ data: parsed, source: 'lsscsi', store: true });
        } catch (e) {
            return Promise.resolve({ source: 'lsscsi', error: e });
        }
    };

    CommandParser.prototype[megaraidControllerCount] = function(data) {
        if (data.error) {
            return Promise.resolve({ source: 'megaraid-controller-count', error: data.error });
        }
        try {
            var store = true;
            var parsed = JSON.parse(data.stdout);
            if (parsed.Controllers[0]['Response Data']['Controller Count'] === 0) {
                store = false;
            }
            return Promise.resolve({
                data: parsed,
                source: 'megaraid-controller-count',
                store: store
            });
        } catch (e) {
            return Promise.resolve({ source: 'megaraid-controllers', error: e });
        }
    };

    CommandParser.prototype[megaraidAdapterInfo] = function(data) {
        if (data.error) {
            return Promise.resolve({ source: 'megaraid-controllers', error: data.error });
        }
        try {
            var store = true;
            var parsed = JSON.parse(data.stdout);
            if (parsed.Controllers[0]['Command Status'].Status === 'Failure') {
                store = false;
            }
            return Promise.resolve({ data: parsed, source: 'megaraid-controllers', store: store });
        } catch (e) {
            return Promise.resolve({ source: 'megaraid-controllers', error: e });
        }
    };


    CommandParser.prototype[megaraidVirtualDiskInfo] = function(data) {
        if (data.error) {
            return Promise.resolve({ source: 'megaraid-virtual-disks', error: data.error });
        }
        try {
            var store = true;
            var parsed = JSON.parse(data.stdout);
            if (parsed.Controllers[0]['Command Status'].Status === 'Failure') {
                store = false;
            }
            return Promise.resolve({
                data: parsed,
                source: 'megaraid-virtual-disks',
                store: store
            });
        } catch (e) {
            return Promise.resolve({ source: 'megaraid-virtual-disks', error: e });
        }
    };

    CommandParser.prototype[megaraidDriveInfo] = function(data) {
        if (data.error) {
            return Promise.resolve({ source: 'megaraid-physical-drives', error: data.error });
        }
        try {
            var store = true;
            var parsed = JSON.parse(data.stdout);
            if (parsed.Controllers[0]['Command Status'].Status === 'Failure') {
                store = false;
            }
            return Promise.resolve({
                data: parsed,
                source: 'megaraid-physical-drives',
                store: store
            });
        } catch (e) {
            return Promise.resolve({ source: 'megaraid-physical-drives', error: e });
        }
    };

    CommandParser.prototype[mpt2fusionAdapterInfo] = function(data) {
        if (data.error) {
            return Promise.resolve({ source: 'mpt2fusion-adapters', error: data.error });
        }
        try {
            var lines = data.stdout.split('\n');
            lines = lines.slice(5, lines.length-4);
            _.remove(lines, function (line) {
                if (!line) {
                    return true;
                } else {
                    return false;
                }
            });
            var parsed = _.transform(lines, function(result, line) {
                var split = line.split(':');
                split[0] = split[0].trim();
                if (split.length > 2) {
                    split[1] = split.slice(1).join(':').trim();
                } else {
                    split[1] = split[1].trim();
                }
                result[split[0]] = split[1];
            }, {});

            return Promise.resolve({ data: parsed, source: 'mpt2fusion-adapters', store: true });
        } catch (e) {
            return Promise.resolve({ source: 'mpt2fusion-adapters', error: e });
        }
    };

    CommandParser.prototype[mellanoxInfo] = function(data) {
        if (data.error) {
            return Promise.resolve({ source: 'mellanox', error: data.error });
        } else if (!data.stdout) {
            return Promise.resolve({ source: 'mellanox', error: new Error("No data") });
        }
        var resolve;
        var deferred = new Promise(function(_resolve) {
            resolve = _resolve;
        });
        xmlParser(data.stdout, function(err, out) {
            if (err) {
                resolve({ source: 'mellanox', error: err });
            } else {
                resolve({
                    data: out,
                    source: 'mellanox',
                    store: true
                });
            }
        });
        return deferred;
    };

    CommandParser.prototype[ipmiSelInformation] = function(data) {
        if (data.error) {
            return Promise.resolve({ source: 'ipmi-sel-information', error: data.error });
        }
        try {
            var lines = data.stdout.trim().split('\n');
            lines.shift();
            var parsed = _.transform(lines, function(result, line) {
                var split = line.split(' : ');
                result[split.shift().trim()] = split.shift().trim();
            }, {});

            return Promise.resolve({ data: parsed, source: 'ipmi-sel-information', store: true });
        } catch (e) {
            return Promise.resolve({ source: 'ipmi-sel-information', error: e });
        }
    };

    CommandParser.prototype[ipmiSel] = function(data) {
        if (data.error) {
            return Promise.resolve({ source: 'ipmi-sel', error: data.error });
        }
        try {
            var lines = data.stdout.split('\n');
            _.remove(lines, function(line) {
                if (!line) {
                    return true;
                } else {
                    return false;
                }
            });
            var parsed = _.transform(lines, function(result, line) {
                var split = line.split(',');
                result[split.shift()] = split;
            }, {});

            return Promise.resolve({ data: parsed, source: 'ipmi-sel', store: true });
        } catch (e) {
            return Promise.resolve({ source: 'ipmi-sel', error: e });
        }
    };

    CommandParser.prototype[ipmiFru] = function(data) {
        if (data.error) {
            return Promise.resolve({ source: 'ipmi-fru', error: data.error });
        }
        try {
            var split = data.stdout.split('\n');
            _.remove(split, function(line) {
                if (!line) {
                    return true;
                } else {
                    return false;
                }
            });
            split = _.map(split, function(line) {
                var sep = line.split(':');
                sep[0] = sep[0].trim();
                sep[1] = sep[1] ? sep[1].trim() : '';
                return sep;
            });
            var parsed = {};
            var key;
            _.forEach(split, function(line) {
                if (line[0] === 'FRU Device Description') {
                    key = line[1];
                    parsed[key] = {};
                } else  {
                    parsed[key][line[0]] = line[1];
                }
            });
            return Promise.resolve({ data: parsed, source: 'ipmi-fru', store: true });
        } catch (e) {
            return Promise.resolve({ source: 'ipmi-fru', error: e });
        }
    };


    CommandParser.prototype[ipmiMcInfo] = function(data) {
        if (data.error) {
            return Promise.resolve({ source: 'ipmi-mc-info', error: data.error });
        }
        if (!data.stdout) {
            return Promise.resolve({
                source: 'ipmi-mc-info',
                error: new Error("no stdout returned from command. Data is "+data)
            });
        }
        try {
            var split = data.stdout.split('\n');
            _.remove(split, function(line) {
                if (!line) {
                    return true;
                } else {
                    return false;
                }
            });
            split = _.map(split, function(line) {
                var sep = line.split(':');
                sep[0] = sep[0].trim();
                sep[1] = sep[1] ? sep[1].trim() : '';
                return sep;
            });
            var parsed = {};
            _.forEach(split, function(line) {
                if (line[0] === 'Additional Device Support') {
                    parsed['Additional Device Support'] = [];
                } else if (line[0] === 'Aux Firmware Rev Info') {
                    parsed['Aux Firmware Rev Info'] = [];
                } else if (parsed['Aux Firmware Rev Info']) {
                    parsed['Aux Firmware Rev Info'].push(line[0]);
                } else if (parsed['Additional Device Support']) {
                    parsed['Additional Device Support'].push(line[0]);
                } else {
                    parsed[line[0]] = line[1];
                }
            });

            return Promise.resolve({ data: parsed, source: 'ipmi-mc-info', store: true });
        } catch (e) {
            return Promise.resolve({ source: 'ipmi-mc-info', error: e });
        }
    };

    CommandParser.prototype[amiBios] = function(data) {
        if (data.error) {
            return Promise.resolve({ source: 'ami', error: data.error });
        }
        try {
            var lines = data.stdout.split('\n');
            var parsed = {};
            _.forEach(lines, function(line) {
                if (line.match(/System ROM ID/)) {
                    parsed.systemRomId = _.last(line.split(' = '));
                } else if (line.match(/System ROM GUID/)) {
                    parsed.systemRomGuid = _.last(line.split(' = '));
                } else if (line.match(/System ROM Secure Flash/)) {
                    parsed.systemRomSecureFlash = _.last(line.split(' = '));
                }
            });
            return Promise.resolve({ data: parsed, source: 'ami', store: true });
        } catch (e) {
            return Promise.resolve({ source: 'ami', error: e });
        }
    };

    CommandParser.prototype[testEsesR] = function(data) {
        if (data.error) {
            return Promise.resolve({ source: 'test_eses', error: data.error });
        } else if (!data.stdout) {
            return Promise.resolve({ source: 'test_eses', error: new Error("No data") });
        }
        var resolve;
        var deferred = new Promise(function(_resolve) {
            resolve = _resolve;
        });
        xmlParser(data.stdout, function(err, out) {
            if (err) {
                resolve({ source: 'test_eses', error: err });
            } else {
                resolve({
                    data: out,
                    source: 'test_eses',
                    store: true
                });
            }
        });
        return deferred;
    };

    CommandParser.prototype[testEsesQ] = function(data) {
        if (data.error) {
            return Promise.resolve({ source: 'test_eses', error: data.error });
        } else if (!data.stdout) {
            return Promise.resolve({ source: 'test_eses', error: new Error("No data") });
        }
        var resolve;
        var deferred = new Promise(function(_resolve) {
            resolve = _resolve;
        });
        xmlParser(data.stdout, function(err, out) {
            if (err) {
                resolve({ source: 'test_eses', error: err });
            } else {
                resolve({
                    data: out,
                    source: 'test_eses',
                    store: true
                });
            }
        });
        return deferred;
    };

    CommandParser.prototype.parseUnknownTasks = function(tasks) {
        return Promise.all(_.map(tasks, function(data) {
            var out;
            if (data.error) {
                return Promise.resolve({ source: data.source, error: data.error });
            } else if (!data.stdout) {
                return Promise.resolve({ source: data.source, error: new Error("No data") });
            }
            if (data.format === 'json') {
                try {
                    out = JSON.parse(data.stdout);
                } catch (e) {
                    return Promise.resolve({ source: data.source, error: e });
                }
                return Promise.resolve({
                    source: data.source,
                    data: out,
                    store: true
                });
            } else if (data.format === 'xml') {
                xmlParser(data.stdout, function(err, out) {
                    if (err) {
                        return Promise.resolve({ source: data.source, error: err });
                    } else {
                        return Promise.resolve({
                            data: out,
                            source: data.source,
                            store: true
                        });
                    }
                });
            } else {
                return Promise.resolve({
                    source: data.source,
                    data: { data: data.stdout },
                    store: true
                });
            }
        }));
    };

    CommandParser.prototype.parseTasks = function parseTasks(tasks) {
        var self = this;

        return Promise.all(_.map(tasks, function(task) {
            // if there's an explicit match parser listed, use it
            if (self[task.cmd]) {
                return self[task.cmd](task);
            }
            // if there's a match on a regex parser listed, use it
            for(var parsername in matchParsers) {
                if (matchParsers.hasOwnProperty(parsername)) {
                    if (task.cmd.match(matchParsers[parsername].regex)) {
                        return matchParsers[parsername].parsefunction(task);
                    }
                }
            }
            // otherwise return an error for no parser existing
            var error = new Error("No parser exists for command " + task.cmd);
            return Promise.resolve({ source: task.cmd, error: error });
        }));
    };

    /**
     * Parse the whole SMART data of one drive.
     *
     * The data catalog is refer to the smartctl GUI.
     *
     * @param {String} The whole smartctl output data for one drive.
     * @param {Object} The object with well classfied SMART information.
     */
    function _parseSmartOneDriveData(dataBlock) {
        //split output by empty line
        var dataSegments = dataBlock.split(/\r?\n\s*\r?\n/); //Divided by empty line
        var drvObj = {};

        _.forEach(dataSegments, function(data) {
            data = data.trim();

            //remove the empty data segment and the segment with smartctl version
            if (data.length === 0 || data.match(/^smartctl\s([\d\.]+)\s/)) {
                return;
            }

            var lines = data.split(/\r?\n/); //Divided by line

            if (data.startsWith('=== START OF INFORMATION SECTION ===')) {
                drvObj.Identity = _parseSmartInfoSection(lines);
            }
            else if (data.startsWith('=== START OF READ SMART DATA SECTION ===')) {
                drvObj['Self-Assessment'] = _parseSmartSelfAssessment(lines);
            }
            else if (data.startsWith('General SMART Values')) {
                drvObj.Capabilities = _parseSmartCapabilities(lines);
            }
            else if (data.startsWith('SMART Attributes Data Structure revision number:')) {
                drvObj.Attributes = _parseSmartAttributes(lines);
            }
            else if (data.startsWith('SMART Error Log Version:')) {
                drvObj['Error Log'] = _parseSmartErrorLog(lines);
            }
            else if (data.startsWith('SMART Self-test log structure revision number')) {
                drvObj['Self-test Log'] = _parseSmartSelfTestLog(lines);
            }
            else if (data.startsWith(
                    'SMART Selective self-test log data structure revision number')) {
                drvObj['Selective Self-test Log'] = _parseSmartSelectiveSelfTestLog(lines);
            }
            else {
                //I don't find the regular pattern for some data segment, or I don't know how to
                //well classify some data, so just put them in the 'Un-parsed Raw Data'.
                if (_.isArray(drvObj['Un-parsed Raw Data'])) {
                    drvObj['Un-parsed Raw Data'].push(data);
                }
                else {
                    drvObj['Un-parsed Raw Data'] = [data];
                }
            }
        });

        return drvObj;
    }

    /*
     * Parse the regular line that sperated by colon
     *
     * @param {String} The string line that is used to parse
     * @param {Object} The target object that will be added the property to it by the parse result.
     * @return {Object} The object with newly parsed property.
     */
    function _parseSmartColonLine(line, obj) {
        //some of the value contains colon, so this is why I don't split the string using colon.
        //Lie this:
        //    Local Time is:    Fri Jun 12 23:55:27 2015 CST
        var pos = line.indexOf(':');
        var key, val;
        if (pos < 0) {//If no colon, then put this into key 'Others'
            key = 'Others';
            val = line;
        }
        else {
            key = line.substring(0, pos);
            val = line.substring(pos + 1).trim();
        }

        //Some of identity occurs multi times
        //Example data:
        //SMART support is: Available - device has SMART capability.
        //SMART support is: Enabled
        if (obj.hasOwnProperty(key)) {
            if (_.isArray(obj[key])) {
                obj[key] = obj[key].push(val);
            }
            else {
                obj[key] = [obj[key], val];
            }
        }
        else {
            obj[key] = val;
        }
        return obj;
    }

    /**
     * Parse the SMART information section
     *
     * @param {Array} The data to parse, it has been splitted by lines
     * @return {Object}
     */
    function _parseSmartInfoSection(lines) {
        /*
         *Example data:

         === START OF INFORMATION SECTION ===
         Device Model:     Micron_P400e-MTFDDAK200MAR
         Serial Number:    1144031E6FB3
         LU WWN Device Id: 5 00a075 1031e6fb3
         Firmware Version: 0135
         User Capacity:    200,049,647,616 bytes [200 GB]
         */
        var result = {};
        //ignore the first line
        for (var i = 1; i < lines.length; i+=1) {
            _parseSmartColonLine(lines[i], result);
        }
        return result;
    }

    /**
     * Parse the SMART self-assessment result
     *
     * @param {Array} The data to parse, it has been splitted by lines
     * @return {Object}
     */
    function _parseSmartSelfAssessment(lines) {
        /*
          Example 1:

          === START OF READ SMART DATA SECTION ===
          SMART overall-health self-assessment test result: PASSED

          Example 2:

          === START OF READ SMART DATA SECTION ===
          SMART Health Status: OK
        */
        var result = {};
        //ignore the first line
        for (var i = 1; i < lines.length; i+=1) {
            _parseSmartColonLine(lines[i], result);
        }
        return result;
    }

    /**
     * Parse SMART capabilities information from smartctl output
     *
     * @param {Array} The data to parse, it has been splitted by lines
     * @return {Array} All parsed capabilities entries,
     *                 each entry contains properties 'Name', 'Value' and 'Annotation'.
     */
    function _parseSmartCapabilities(lines) {
        var combineLines = [];
        var strBuf = '';

        /*
         The first line is 'General SMART Values:', it should be discarded.

         Some of the entry information is divided into multiline,
         so first we try to combine these lines to achieve a regular patter.
         Below is the example data:

         Offline data collection status:  (0x84)  Offline data collection activity
         was suspended by an interrupting command from host.
         Auto Offline Data Collection: Enabled.
        */
        for (var i = 1; i < lines.length; i+=1) {
            var firstChar = lines[i][0];
            if (firstChar >= 'A' && firstChar <= 'Z') {
                if (strBuf !== '') {
                    combineLines.push(strBuf);
                }
                strBuf = lines[i];
            }
            else {
                if (strBuf[strBuf.length-1] !== '.') {
                    strBuf += ' ';
                }
                strBuf += lines[i].trim();
            }
        }
        if (strBuf !== '') { // if this is ignored, the last capabilities entry will be missed.
            combineLines.push(strBuf);
        }

        //After combination, each line will become something like this:
        //name:  (0x84)  annotation1.annotation2.annotation3
        var result = [];
        _.forEach(combineLines, function(line) {
            var arr = line.split(/:\s*\(\s*(\w+)\)\s*/);
            var annotation = (arr[2] ? arr[2].split('.') : []);
            if (annotation.length > 0 && annotation[annotation.length-1].length === 0) {
                annotation.pop();
            }
            result.push({
                'Name'  : arr[0],
                'Value' : arr[1] || '',
                'Annotation' : annotation
            });
        });
        return result;
    }

    /**
     * Parse the SMART attribute table
     *
     * @param {Array} The input data that has been splitted by line.
     * @param {Object} The object with SMART attribute revision and table.
     */
    function _parseSmartAttributes(lines) {
        var attrObj = {};
        /* Example data:
         SMART Attributes Data Structure revision number: 1
         Vendor Specific SMART Attributes with Thresholds:
         ID# ATTRIBUTE_NAME       FLAG    VALUE WORST THRESH TYPE      UPDATED
           1 Raw_Read_Error_Rate  0x0003  100   100   006    Pre-fail  Always
           3 Spin_Up_Time         0x0003  100   100   000    Pre-fail  Always
           4 Start_Stop_Count     0x0002  100   100   020    Old_age   Always
        */
        //Parse first line to get revision number
        //Example data: "SMART Attributes Data Structure revision number: 16"
        if (lines.length > 0) {
            attrObj.Revision = (lines[0].substring(lines[0].lastIndexOf(' ') + 1)).trim();
        }
        attrObj['Attributes Table'] = _parseSmartTable(lines, 2, /\s+/);
        return attrObj;
    }

    /**
     * Parse SMART error log
     *
     * @param {Array} The data to parse, it has been splitted by line.
     * @return {Object} The object with error log revision and table.
     */
    function _parseSmartErrorLog(lines) {
        var resultObj = {};

        //Parse first line to get revision number
        //Example data:
        //SMART Error Log Version: 1
        if (lines.length > 0) {
            resultObj.Revision = (lines[0].substring(
                lines[0].lastIndexOf(' ') + 1)).trim();
        }

        //TODO: need to implement the error log parser

        resultObj['Error Log Table'] = [];
        if (lines.length > 1 && lines[1].startsWith('No ')) {
            return resultObj;
        }
        //resultObj['Error Log Table'] = _parseSmartTable(lines, 1);

        return resultObj;
    }

    /**
     * Parse SMART Self-test log
     *
     * @param {Array} The data to parse, it has been splitted by line.
     * @return {Object} The object with self-test log revision and table.
     */
    function _parseSmartSelfTestLog(lines) {
        /* Example data:
         SMART Self-test log structure revision number 1
         Num  Test_Description    Status      Remaining  LifeTime
         # 1  Vendor (0xff)       Completed         00%       463
         # 2  Vendor (0xff)       Completed         00%       288
         # 3  Extended offline    Completed         00%       263
         */
        var resultObj = {};

        //Parse first line to get revision number
        if (lines.length > 0) {
            resultObj.Revision = (lines[0].substring(lines[0].lastIndexOf(' ') + 1)).trim();
        }

        resultObj['Self-test Log Table'] = [];
        if (lines.length > 1 && lines[1].startsWith('No self-tests have been logged')) {
            return resultObj;
        }
        resultObj['Self-test Log Table'] = _parseSmartTable(lines, 1);

        return resultObj;
    }

    /**
     * Parse the Selective Self-test Log from the smartctl output
     *
     * The caller should make sure the input is the right block data for selective self-test log,
     * this function will not validate whether the input is valid.
     *
     * @param {Array} The data to parse, it has been splitted by line
     * @return {Object} The object with selective self-test log revision and table.
     * @api {private}
     */
    function _parseSmartSelectiveSelfTestLog(lines) {
        /* Below is the example data for Selective Self-test Log:

         SMART Selective self-test log data structure revision number 1
          SPAN  MIN_LBA  MAX_LBA  CURRENT_TEST_STATUS
             1        0        0  Not_testing
             2        0        0  Not_testing
             3        0        0  Not_testing
             4        0        0  Not_testing
             5        0        0  Not_testing
         Selective self-test flags (0x0):
           After scanning selected spans, do NOT read-scan remainder of disk.
         If Selective self-test is pending on power-up, resume after 0 minute delay.
         */
        var resultObj = {};

        if (lines.length > 0) {
            resultObj.Revision = (lines[0].substring(lines[0].lastIndexOf(' ') + 1)).trim();
        }

        resultObj['Selective Self-test Log Table'] = [];
        if (lines.length > 1 && !lines[1].startsWith('No ')) {
            resultObj['Selective Self-test Log Table'] = _parseSmartTable(lines, 1, /\s{2,}/,
                function (line) {
                    return line.startsWith('Selective self-test flags');
                }
            );
        }

        var flagRow = resultObj['Selective Self-test Log Table'].length + 2;
        if (lines.length > flagRow) {
            var arr = lines[flagRow].split(/\s*\(\s*(\w+)\)\s*:/);
            var annotation = [];
            for (var i = flagRow + 1; i < lines.length; i+=1) {
                var trimLine = lines[i].trim();
                if (trimLine.length !== 0) {
                    annotation.push(trimLine);
                }
            }
            resultObj[arr[0]] = {
                'Value' : arr[1],
                'Annotation' : annotation};
        }

        return resultObj;
    }

    /**
     * Parse the table data to an array of object
     *
     * The object properties (column header) is extracted from the first
     * valid line (line index = ignoreLinesCount)
     *
     * @param {Array} The data to parse, it has been splitted by lines
     * @param {Number} The number of lines that needed be discarded before parsing.
     * @param {RegExp} The regular expression that tells how to split a row
     *                 (not including the column header)
     * @param {Function (String)} The function that tells whether the line has been the end of table
     * @return {Array}
     * @api private
     */
    function _parseSmartTable(lines,
                              ignoreLinesCount,
                              regSplitRow,
                              funcCheckTableEnd)
    {
        /* Example 1:

         ID# ATTRIBUTE_NAME          FLAG     VALUE WORST THRESH TYPE      UPDATED
           1 Raw_Read_Error_Rate     0x0003   100   100   006    Pre-fail  Always
           3 Spin_Up_Time            0x0003   100   100   000    Pre-fail  Always
           4 Start_Stop_Count        0x0002   100   100   020    Old_age   Always
           5 Reallocated_Sector_Ct   0x0003   100   100   036    Pre-fail  Always
           9 Power_On_Hours          0x0003   100   100   000    Pre-fail  Always
          12 Power_Cycle_Count       0x0003   100   100   000    Pre-fail  Always
         190 Airflow_Temperature_Cel 0x0003   069   069   050    Pre-fail  Always

           Example 2:

         Num  Test_Description    Status    Remaining  LifeTime
         # 1  Vendor (0xff)       Completed       00%       463
         # 2  Vendor (0xff)       Completed       00%       288
         # 3  Extended offline    Completed       00%       263
         # 4  Short offline       Completed       00%       263
        */

        var resultObj = [];
        var colHeaders;
        regSplitRow = regSplitRow || /\s{2,}/; //default to split with more than 2 spaces

        if (lines.length <= ignoreLinesCount + 1) { //should contains at least the column header row
            return resultObj;
        }

        //The first line should be the column header
        colHeaders = lines[ignoreLinesCount].split(/\s+/);
        if (colHeaders[0].trim().length === 0) {
            colHeaders.shift();
        }

        for (var i = ignoreLinesCount + 1; i < lines.length; i+=1) {
            if (funcCheckTableEnd && funcCheckTableEnd(lines[i])) {
                break; //skip early if reach the end of table
            }

            var arr = lines[i].split(regSplitRow);
            if (arr[0].trim().length === 0) {
                arr.shift();
            }

            var entry = {};
            var j;
            for (j = 0; j < colHeaders.length - 1; j += 1) {
                entry[colHeaders[j]] = arr[j]; //Fill each column data
            }
            //There maybe more cells than the header, we append these cells to the last column.
            //For example, the 'RAW_VALUE' in the attributes table may be like '31 (Min/Max 31/31)'
            entry[colHeaders[j]] = arr.slice(j, arr.length).join(' ');
            resultObj.push(entry);
        }

        return resultObj;
    }

    return new CommandParser();

}