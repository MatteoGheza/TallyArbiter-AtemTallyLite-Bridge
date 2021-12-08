const bonjour = require('bonjour')();
const clc = require('cli-color');
const io = require("socket.io-client");

var ip = "";
var port = 4455;

var TallyPiList = [];

var fakeAtemTallyLiteServer = undefined;

var previewBusId = "e393251c";
var programBusId = "334e4eda";

var searchPIs = true;

function logger(log, type) {
	//logs the item to the console
	//copied from TallyArbiter blinkt listener

	let dtNow = new Date();

	if(typeof(log) !== "string") log = JSON.stringify(log);

	switch(type) {
		case 'info':
			console.log(clc.black(`[${dtNow}]`) + '     ' + clc.blue(log));
			break;
		case 'error':
			console.log(clc.black(`[${dtNow}]`) + '     ' + clc.red.bold(log));
			break;
		case 'debug':
			console.log(clc.black(`[${dtNow}]`) + '     ' + clc.green.bold(log));
			break;
		default:
			console.log(clc.black(`[${dtNow}]`) + '     ' + log);
			break;
	}
}

function connectTallyArbiter(ip, port) {
	logger(`Connecting to Tally Arbiter server: ${ip}:${port}`, 'info');
	socket = io.connect(`http://${ip}:${port}`, {reconnect: true});

	socket.on('connect', function(){
		logger('Connected to Tally Arbiter server.', 'info');
		setTimeout(() => {
			searchPIs = false;
			TallyPiList.forEach((s) => {
				logger(`Adding listener client (${s.txt.id}) for Tally Pi server: ${s.host}:${s.port}`, 'info');
				socket.emit('listenerclient_connect', {
					'deviceId': `not_assigned_${s.txt.id}`,
					'internalId': s.txt.id,
					'listenerType': `atemTallyLite_${s.txt.id}`,
					'canBeReassigned': true,
					'canBeFlashed': true,
					'supportsChat': false
				});
			});
		}, 3000);
	});

	socket.on('disconnect', function(){
		logger('Disconnected from Tally Arbiter server.', 'error');
	});

	socket.on('error', function(error){
		logger(error, 'error');
	});

	socket.on('device_states', function(device_states) {
		logger(device_states, 'debug');
		device_states.forEach((d) => {
			if(d.sources.indexOf("123") > -1) {
				a.push(d.deviceId);
			}
		});
		fakeAtemTallyLiteServer.emit('update_tally', {
			programSourceIds: device_states.filter((el) => el.busId == programBusId && el.sources.length > 0).map((el) => el.deviceId),
			previewSourceIds: device_states.filter((el) => el.busId == previewBusId && el.sources.length > 0).map((el) => el.deviceId),
		});
	});

	socket.on('bus_options', function(bus_options) {
		logger(bus_options, 'debug');
		previewBusId = bus_options.find(x => x.label === "Preview").id;
		programBusId = bus_options.find(x => x.label === "Program").id;
	});

	socket.on('flash', function(internalId) {
        logger(`Tally Pi ${internalId} has been flashed.`, 'info');

		fakeAtemTallyLiteServer.emit('update_tally', []);

        fakeAtemTallyLiteServer.emit('set_remote', {
            devId: internalId,
            identify: 1
        });
	});

	socket.on('reassign', function(oldDeviceId, newDeviceId, internalId) {
		logger(`oldDeviceId: ${oldDeviceId}, newDeviceId: ${newDeviceId}, internalId: ${internalId}`, 'debug');
		socket.emit('listener_reassign', oldDeviceId, newDeviceId);
		fakeAtemTallyLiteServer.emit('update_tally', []);
		fakeAtemTallyLiteServer.emit('set_remote', {
			devId: internalId,
			camera: newDeviceId
		})
	});
}

function connectTallyPi(s) {
	let client = io.connect(`http://${s.host}:${s.port}`, {reconnect: true});
	client.on('connect', function(){
		client.emit('pi_host_connect', "http://127.0.0.1:3777");
	});
	s["client"] = client;
    TallyPiList.push(s);
    console.log("TallyPiList", TallyPiList);
}

function setupFakeServer() {
	fakeAtemTallyLiteServer = require("socket.io")(3777);
	fakeAtemTallyLiteServer.on('connection', function(socket) {
		logger(`Tally Pi server connected`, 'info');
		socket.on('connect', function(data) {
			logger(`Tally Pi server connected`, 'info');
		});
	});
}

function setupBridge() {
	setupFakeServer();

    bonjour.find({ type: 'dsft-tally-pi' }, function(s) {
        if(!searchPIs) return;

		logger(`Found Tally PI server using MDNS: ${s.host}:${s.port}`, 'info');
        connectTallyPi(s);
    });

	bonjour.findOne({ type: 'tally-arbiter' }, function (service) {
		ip = service.host;
		port = service.port;
		if(service.txt.version.startsWith('2.')) {
			logger(`Error connecting to Tally Arbiter: Tally Arbiter server version ${service.txt.version} is not supported.`, 'error');
			process.exit(3);
		}
		logger(`Found TallyArbiter server using MDNS: ${ip}:${port}`, 'info');
		connectTallyArbiter(ip, port);
	});
}

setupBridge();
