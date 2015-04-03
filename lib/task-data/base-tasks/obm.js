module.exports = {
    friendlyName: 'Node Obm',
    injectableName: 'Task.Base.Obm.Node',
    runJob: 'Job.Obm.Node',
    requiredOptions: [
        'action',
        'obmServiceName'
    ],
    requiredProperties: {},
    properties: {
        power: {}
    }
};