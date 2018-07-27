var exec = require("child_process").exec;
var Accessory, Service, Characteristic, UUIDGen;

module.exports = function (homebridge) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform("homebridge-CmdProgSwitchB", "CmdProgSwitchB", CmdSwitchBPlatform, true);
}

function CmdProgSwitchBPlatform(log, config, api) {
  this.log = log;
  this.config = config || {"platform": "CmdProgSwitchB"};
  this.switches = this.config.switches || [];

  this.accessories = {};
  this.polling = {};

  if (api) {
    this.api = api;
    this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
  }
}

// Method to restore accessories from cache
CmdProgSwitchBPlatform.prototype.configureAccessory = function (accessory) {
  this.setService(accessory);
  this.accessories[accessory.context.name] = accessory;
}

// Method to setup accesories from config.json
CmdProgSwitchBPlatform.prototype.didFinishLaunching = function () {
  // Add or update accessories defined in config.json
  for (var i in this.switches) this.addAccessory(this.switches[i]);

  // Remove extra accessories in cache
  for (var name in this.accessories) {
    var accessory = this.accessories[name];
    if (!accessory.reachable) this.removeAccessory(accessory);
  }
}

// Method to add and update HomeKit accessories
cmdSwitchPlatform.prototype.addAccessory = function (data) {
  this.log("Initializing platform accessory '" + data.name + "'...");

  // Retrieve accessory from cache
  var accessory = this.accessories[data.name];

  if (!accessory) {
    // Setup accessory as PROGRAMMABLE SWITCH (16) category.
    var uuid = UUIDGen.generate(data.name);
    accessory = new Accessory(data.name, uuid, 16);

    // Setup HomeKit switch service
    accessory.addService(Service.StatelessProgrammableSwitch, data.name);

    // New accessory is always reachable
    accessory.reachable = true;

    // Setup listeners for different switch events
    this.setService(accessory);

    // Register new accessory in HomeKit
    this.api.registerPlatformAccessories("homebridge-CmdProgSwitchB", "CmdProgSwitchB", [accessory]);

    // Store accessory in cache
    this.accessories[data.name] = accessory;
  }

  // Confirm variable type
  data.polling = data.polling === true;
  data.interval = parseInt(data.interval, 10) || 1;
  data.timeout = parseInt(data.timeout, 10) || 1; 
  if (data.manufacturer) data.manufacturer = data.manufacturer.toString();
  if (data.model) data.model = data.model.toString();
  if (data.serial) data.serial = data.serial.toString();

  // Store and initialize variables into context
  var cache = accessory.context;
  cache.name = data.name;
  cache.on_cmd = data.on_cmd;
  cache.auto_cmd = data.auto_cmd
  cache.off_cmd = data.off_cmd;
  cache.state_cmd = data.state_cmd;
  cache.polling = data.polling;
  cache.interval = data.interval;
  cache.timeout = data.timeout;
  cache.manufacturer = data.manufacturer;
  cache.model = data.model;
  cache.serial = data.serial;
  if (cache.state === undefined) {
    cache.state = false;
    if (data.off_cmd && !data.on_cmd && !data.auto_cmd) cache.state = true;
  }

  // Retrieve initial state
  this.getInitState(accessory);

  // Configure state polling
  if (data.polling && data.state_cmd) this.statePolling(data.name);
}

// Method to remove accessories from HomeKit
CmdProgSwitchBPlatform.prototype.removeAccessory = function (accessory) {
  if (accessory) {
    var name = accessory.context.name;
    this.log(name + " is removed from HomeBridge.");
    this.api.unregisterPlatformAccessories("homebridge-CmdProgSwitchB", "CmdProgSwitchB", [accessory]);
    delete this.accessories[name];
  }
}

// Method to setup listeners for different events
CmdProgSwitchBPlatform.prototype.setService = function (accessory) {
  accessory.getService(Service.StatelessProgrammableSwitch)
    .getCharacteristic(Characteristic.SinglePress)
    .SinglePress('get', this.getPowerState.bind(this, accessory.context))
    .SinglePress('set', this.setPowerState.bind(this, accessory.context));

  accessory.on('identify', this.identify.bind(this, accessory.context));
}

// Method to retrieve initial state
cmdSwitchPlatform.prototype.getInitState = function (accessory) {
  var manufacturer = accessory.context.manufacturer || "Default-Manufacturer";
  var model = accessory.context.model || "Default-Model";
  var serial = accessory.context.serial || "Default-SerialNumber";

  // Update HomeKit accessory information
  accessory.getService(Service.AccessoryInformation)
    .setCharacteristic(Characteristic.Manufacturer, manufacturer)
    .setCharacteristic(Characteristic.Model, model)
    .setCharacteristic(Characteristic.SerialNumber, serial);

  // Retrieve initial state if polling is disabled
  if (!accessory.context.polling) {
    accessory.getService(Service.Switch)
      .getCharacteristic(Characteristic.On)
      .getValue();
  }

  // Configured accessory is reachable
  accessory.updateReachability(true);
}

// Method to determine current state
cmdSwitchPlatform.prototype.getState = function (thisSwitch, callback) {
  var self = this;

  // Return cached state if no state_cmd provided
  if (thisSwitch.state_cmd === undefined) {
    callback(null, thisSwitch.state);
    return;
  }

  // Execute command to detect state
  exec(thisSwitch.state_cmd, function (error, stdout, stderr) {
    var state = error ? false : true;

    // Error detection
    if (stderr) {
      self.log("Failed to determine " + thisSwitch.name + " state.");
      self.log(stderr);
    }

    callback(stderr, state);
  });
}

// Method to determine current state
cmdSwitchPlatform.prototype.statePolling = function (name) {
  var accessory = this.accessories[name];
  var thisSwitch = accessory.context;

  // Clear polling
  clearTimeout(this.polling[name]);

  this.getState(thisSwitch, function (error, state) {
    // Update state if there's no error
    if (!error && state !== thisSwitch.state) {
      thisSwitch.state = state;
      accessory.getService(Service.Switch)
        .getCharacteristic(Characteristic.On)
        .getValue();
    }
  });

  // Setup for next polling
  this.polling[name] = setTimeout(this.statePolling.bind(this, name), thisSwitch.interval * 1000);
}

// Method to determine current state
cmdSwitchPlatform.prototype.getPowerState = function (thisSwitch, callback) {
  var self = this;

  if (thisSwitch.polling) {
    // Get state directly from cache if polling is enabled
    this.log(thisSwitch.name + " is " + (thisSwitch.state ? "on." : "off."));
    callback(null, thisSwitch.state);
  } else {
    // Check state if polling is disabled
    this.getState(thisSwitch, function (error, state) {
      // Update state if command exists
      if (thisSwitch.state_cmd) thisSwitch.state = state;
      if (!error) self.log(thisSwitch.name + " is " + (thisSwitch.state ? "on." : "off."));
      callback(error, thisSwitch.state);
    });
  }
}

// Method to set state
CmdProgSwitchBPlatform.prototype.setPowerState = function (thisSwitch, state, callback) {
  var self = this;

  var cmd = state ? thisSwitch.on_cmd : thisSwitch.off_cmd;
  var notCmd = state ? thisSwitch.off_cmd : thisSwitch.on_cmd;
  var autoCmd = state ? thisSwitch.auto_cmd : thisSwitch.off_cmd;
  var tout = null;

  // Execute command to set state
  exec(cmd, function (error, stdout, stderr) {
    // Error detection
    if (error && (state !== thisSwitch.state)) {
      self.log("Failed to turn " + (state ? "on " : "off ") + thisSwitch.name);
      self.log(stderr);
    } else {
      if (cmd) self.log(thisSwitch.name + " is turned " + (state ? "on." : "off."));
      thisSwitch.state = state;
      error = null;
    }

    // Restore switch after 1s if only one command exists
    if (!notCmd && !thisSwitch.state_cmd) {
      setTimeout(function () {
        self.accessories[thisSwitch.name].getService(Service.Switch)
          .setCharacteristic(Characteristic.On, !state);
      }, 1000);
    }

    if (tout) {
      clearTimeout(tout);
      callback(error);
    }
  });

  // Allow 1s to set state but otherwise assumes success
  tout = setTimeout(function () {
    tout = null;
    self.log("Turning " + (state ? "on " : "off ") + thisSwitch.name + " took too long [" + thisSwitch.timeout + "s], assuming success." );
    callback();
  }, thisSwitch.timeout * 1000);
}

// Method to handle identify request
CmdProgSwitchBPlatform.prototype.identify = function (thisSwitch, paired, callback) {
  this.log(thisSwitch.name + " identify requested!");
  callback();
}

// Method to handle plugin configuration in HomeKit app
CmdProgSwitchBPlatform.prototype.configurationRequestHandler = function (context, request, callback) {
  if (request && request.type === "Terminate") {
    return;
  }

  // Instruction
  if (!context.step) {
    var instructionResp = {
      "type": "Interface",
      "interface": "instruction",
      "title": "Before You Start...",
      "detail": "Please make sure homebridge is running with elevated privileges.",
      "showNextButton": true
    }

    context.step = 1;
    callback(instructionResp);
  } else {
    switch (context.step) {
      case 1:
        // Operation choices
        var respDict = {
          "type": "Interface",
          "interface": "list",
          "title": "What do you want to do?",
          "items": [
            "Add New Switch",
            "Modify Existing Switch",
            "Remove Existing Switch"
          ]
        }

        context.step = 2;
        callback(respDict);
        break;
      case 2:
        var selection = request.response.selections[0];
        if (selection === 0) {
          // Info for new accessory
          var respDict = {
            "type": "Interface",
            "interface": "input",
            "title": "New Switch",
            "items": [{
              "id": "name",
              "title": "Name (Required)",
              "placeholder": "HTPC"
            }]
          };

          context.operation = 0;
          context.step = 3;
          callback(respDict);
        } else {
          var names = Object.keys(this.accessories);

          if (names.length > 0) {
            // Select existing accessory for modification or removal
            if (selection === 1) {
              var title = "Which switch do you want to modify?";
              context.operation = 1;
              context.step = 3;
            } else {
              var title = "Which switch do you want to remove?";
              context.step = 5;
            }

            var respDict = {
              "type": "Interface",
              "interface": "list",
              "title": title,
              "items": names
            };

            context.list = names;
          } else {
            // Error if not switch is configured
            var respDict = {
              "type": "Interface",
              "interface": "instruction",
              "title": "Unavailable",
              "detail": "No switch is configured.",
              "showNextButton": true
            };

            context.step = 1;
          }
          callback(respDict);
        }
        break;
      case 3:
        if (context.operation === 0) {
          var data = request.response.inputs;
        } else if (context.operation === 1) {
          var selection = context.list[request.response.selections[0]];
          var data = this.accessories[selection].context;
        }
        
        if (data.name) {
          // Add/Modify info of selected accessory
          var respDict = {
            "type": "Interface",
            "interface": "input",
            "title": data.name,
            "items": [{
              "id": "on_cmd",
              "title": "CMD to Turn On",
              "placeholder": context.operation ? "Leave blank if unchanged" : "wakeonlan XX:XX:XX:XX:XX:XX"
            }, {
              "id": "off_cmd",
              "title": "CMD to Turn Off",
              "placeholder": context.operation ? "Leave blank if unchanged" : "net rpc shutdown -I XXX.XXX.XXX.XXX -U user%password"
            }, {
              "id": "auto_cmd",
              "title": "CMD to Turn Auto",
              "placeholder": context.operation ? "Leave blank if unchanged" : "net rpc shutdown -I XXX.XXX.XXX.XXX -U user%password"
            }, {
              "id": "state_cmd",
              "title": "CMD to Check ON State",
              "placeholder": context.operation ? "Leave blank if unchanged" : "ping -c 2 -W 1 XXX.XXX.XXX.XXX | grep -i '2 received'"
            }, {
              "id": "polling",
              "title": "Enable Polling (true/false)",
              "placeholder": context.operation ? "Leave blank if unchanged" : "false"
            }, {
              "id": "interval",
              "title": "Polling Interval (s)",
              "placeholder": context.operation ? "Leave blank if unchanged" : "1"
            },
            {
              "id": "timeout",
              "title": "On/Off command execution timeout (s)",
              "placeholder": context.operation ? "Leave blank if unchanged" : "1"
            }, {
              "id": "manufacturer",
              "title": "Manufacturer",
              "placeholder": context.operation ? "Leave blank if unchanged" : "Default-Manufacturer"
            }, {
              "id": "model",
              "title": "Model",
              "placeholder": context.operation ? "Leave blank if unchanged" : "Default-Model"
            }, {
              "id": "serial",
              "title": "Serial",
              "placeholder": context.operation ? "Leave blank if unchanged" : "Default-SerialNumber"
            }]
          };

          context.name = data.name;
          context.step = 4;
        } else {
          // Error if required info is missing
          var respDict = {
            "type": "Interface",
            "interface": "instruction",
            "title": "Error",
            "detail": "Name of the switch is missing.",
            "showNextButton": true
          };
        
          context.step = 1;
        }

        delete context.list;
        delete context.operation;
        callback(respDict);
        break;
      case 4:
        var userInputs = request.response.inputs;
        var newSwitch = {};

        // Clone context if switch exists
        if (this.accessories[context.name]) {
          newSwitch = JSON.parse(JSON.stringify(this.accessories[context.name].context));
        }

        // Setup input for addAccessory
        newSwitch.name = context.name;
        newSwitch.on_cmd = userInputs.on_cmd || newSwitch.on_cmd;
        newSwitch.off_cmd = userInputs.off_cmd || newSwitch.off_cmd;
        newSwitch.state_cmd = userInputs.state_cmd || newSwitch.state_cmd;
        if (userInputs.polling.toUpperCase() === "TRUE") {
          newSwitch.polling = true;
        } else if (userInputs.polling.toUpperCase() === "FALSE") {
          newSwitch.polling = false;
        }
        newSwitch.interval = userInputs.interval || newSwitch.interval;
        newSwitch.timeout = userInputs.timeout || newSwitch.timeout;
        newSwitch.manufacturer = userInputs.manufacturer;
        newSwitch.model = userInputs.model;
        newSwitch.serial = userInputs.serial;

        // Register or update accessory in HomeKit
        this.addAccessory(newSwitch);
        var respDict = {
          "type": "Interface",
          "interface": "instruction",
          "title": "Success",
          "detail": "The new switch is now updated.",
          "showNextButton": true
        };

        context.step = 6;
        callback(respDict);
        break;
      case 5:
        // Remove selected accessory from HomeKit
        var selection = context.list[request.response.selections[0]];
        var accessory = this.accessories[selection];

        this.removeAccessory(accessory);
        var respDict = {
          "type": "Interface",
          "interface": "instruction",
          "title": "Success",
          "detail": "The switch is now removed.",
          "showNextButton": true
        };

        delete context.list;
        context.step = 6;
        callback(respDict);
        break;
      case 6:
        // Update config.json accordingly
        var self = this;
        delete context.step;
        var newConfig = this.config;

        // Create config for each switch
        var newSwitches = Object.keys(this.accessories).map(function (k) {
          var accessory = self.accessories[k];
          var data = {
            'name': accessory.context.name,
            'on_cmd': accessory.context.on_cmd,
            'off_cmd': accessory.context.off_cmd,
            'auto_cmd': accessory.context.auto_cmd
            'state_cmd': accessory.context.state_cmd,
            'polling': accessory.context.polling,
            'interval': accessory.context.interval,
            'timeout': accessory.context.timeout,
            'manufacturer': accessory.context.manufacturer,
            'model': accessory.context.model,
            'serial': accessory.context.serial
          };
          return data;
        });

        newConfig.switches = newSwitches;
        callback(null, "platform", true, newConfig);
        break;
    }
  }
}
