var mqtt = require("mqtt");
var Service, Characteristic;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-mqtt-blinds-tasmota", "mqtt-blinds-tasmota", MqttBlindsTasmotaAccessory);
}

function MqttBlindsTasmotaAccessory(log, config) {
    // GLOBAL vars
    this.log = log;

    // CONFIG vars
    this.name = config["name"];
    this.manufacturer = config['manufacturer'] || "";
  	this.model = config['model'] || "";
  	this.serialNumberMAC = config['serialNumberMAC'] || "";

    // MQTT vars
    this.mqttUrl = config["mqttBrokerUrl"];
    this.mqttUsername = config["mqttUsername"];
    this.mqttPassword = config["mqttPassword"];
    this.mqttClientId = 'mqttjs_' + Math.random().toString(16).substr(2, 8);

    // Tasmota vars
    this.mqttTopic = config["mqttTopic"];
    this.mqttShutterIndex = config["mqttShutterIndex"] || "1";
    this.mqttResultTopic = config["mqttResultTopic"] || 'stat/' + this.mqttTopic + '/RESULT';
    this.mqttCommandTopic = config["mqttCommandTopic"] || 'cmnd/' + this.mqttTopic + '/ShutterPosition' + this.mqttShutterIndex;
    this.mqttShutterName = config["mqttShutterName"]  || "Shutter" + this.mqttShutterIndex

    // MQTT options
    this.mqttOptions = {
      keepalive: 10,
      clientId: this.mqttClientId,
      protocolId: 'MQTT',
      protocolVersion: 4,
      clean: true,
      reconnectPeriod: 1000,
      connectTimeout: 30 * 1000,
      will: {
        topic: 'WillMsg',
        payload: 'Connection Closed abnormally..!',
        qos: 0,
        retain: false
      },
      username: this.mqttUsername,
      password: this.mqttPassword,
      rejectUnauthorized: false
    };

    // STATE vars
    this.lastPosition = 100; // last known position of the blinds, open by default
    this.currentPositionState = 2; // stopped by default
    this.currentTargetPosition = 100; // open by default

    // MQTT handling
    this.mqttClient = mqtt.connect(this.mqttUrl, this.mqttOptions);
    var that = this;
  	this.mqttClient.on('error', function() {
  		that.log('Error event on MQTT');
  	});

  	this.mqttClient.on('connect', function() {
      that.log('MQTT is running');
  	});

    this.mqttClient.on('message', function(topic, message) {
      message = JSON.parse(message.toString('utf-8'));
      if (message.hasOwnProperty(that.mqttShutterName)) {

        // update CurrentPosition
        that.lastPosition = parseInt(message[that.mqttShutterName]["Position"]);
        that.service.getCharacteristic(Characteristic.CurrentPosition).updateValue(that.lastPosition);
        that.log("Updated CurrentPosition: %s", that.lastPosition);

        // update PositionState (open = 0 = DECREASING, close = 1 = INCREASING, stop = 2 = STOPPED)
        switch(parseInt(message[that.mqttShutterName]["Direction"])) {
          case -1:
            that.currentPositionState = 0
            that.service.getCharacteristic(Characteristic.PositionState).updateValue(that.currentPositionState);
            that.log("Updated PositionState: %s", that.currentPositionState);
            break
          case 1:
            that.currentPositionState = 1
            that.service.getCharacteristic(Characteristic.PositionState).updateValue(that.currentPositionState);
            that.log("Updated PositionState: %s", that.currentPositionState);
            break
          case 0:
            that.currentPositionState = 2
            that.service.getCharacteristic(Characteristic.PositionState).updateValue(that.currentPositionState);
            that.log("Updated PositionState: %s", that.currentPositionState);
            break
          default:
            that.log("Unknown direction: %s", direction);
        }

        // update TargetPosition
        that.currentTargetPosition = parseInt(message[that.mqttShutterName]["Target"])
        that.service.getCharacteristic(Characteristic.TargetPosition).updateValue(that.currentTargetPosition);
        that.log("Updated TargetPosition: %s", that.currentTargetPosition);
      }
    });

    // MQTT subscribed
    this.mqttClient.subscribe(that.mqttResultTopic);

    // register the service and provide the functions
    this.service = new Service.WindowCovering(this.name);

    // the current position (0-100%)
    this.service
        .getCharacteristic(Characteristic.CurrentPosition)
        .on('get', this.getCurrentPosition.bind(this));

    // the position state (0 = DECREASING, 1 = INCREASING, 2 = STOPPED)
    this.service
        .getCharacteristic(Characteristic.PositionState)
        .on('get', this.getPositionState.bind(this));

    // the target position (0-100%)
    this.service
        .getCharacteristic(Characteristic.TargetPosition)
        .on('get', this.getTargetPosition.bind(this))
        .on('set', this.setTargetPosition.bind(this));
}

MqttBlindsTasmotaAccessory.prototype.getCurrentPosition = function(callback) {
    this.log("Requested CurrentPosition: %s", this.lastPosition);
    callback(null, this.lastPosition);
}

MqttBlindsTasmotaAccessory.prototype.getPositionState = function(callback) {
    this.log("Requested PositionState: %s", this.currentPositionState);
    callback(null, this.currentPositionState);
}

MqttBlindsTasmotaAccessory.prototype.getTargetPosition = function(callback) {
    this.log("Requested TargetPosition: %s", this.currentTargetPosition);
    callback(null, this.currentTargetPosition);
}

MqttBlindsTasmotaAccessory.prototype.setTargetPosition = function(pos, callback) {
    this.log("Set TargetPosition: %s", pos);
    this.mqttClient.publish(this.mqttCommandTopic, pos.toString(), this.mqttOptions);
    callback(null);
}

MqttBlindsTasmotaAccessory.prototype.getServices = function() {
  var informationService = new Service.AccessoryInformation();

  informationService
    .setCharacteristic(Characteristic.Name, this.name)
    .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
    .setCharacteristic(Characteristic.Model, this.model)
    .setCharacteristic(Characteristic.SerialNumber, this.serialNumberMAC);

  return [informationService, this.service];
}
