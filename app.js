"use strict";

require("lugg").init();
var fs = require("fs");
var irc = require("irc-js");
var config = JSON.parse(fs.readFileSync("./config.json", "utf8"));
var twitch = require("twitch.tv");
var log = require("lugg")("app");

var streamers = {};

var initialiseStreamers = function () {
  var channelNames = config.channels;
  channelNames.forEach(function (channelName) {
    if (!streamers.hasOwnProperty(channelName)) {
      streamers[channelName] = {live: false};
    }
  });
};

var updateStreamersStatus = function (channel) {
  log.info("Updating...");
  twitch("streams?channel=" + config.channels, config.twitch, function (err, res) {
    if (err) {
      log.error("Something bad happened :(", err);
      return;
    }
    var streams = res.streams;
    var onlineStreamers = [];
    streams.forEach( function (stream) {
      var streamer = stream.channel.name;
      onlineStreamers.push(streamer);
      if (!streamers[streamer].live) {
        log.info(streamer + " just went live!");
        channel.say(streamer + " began streaming " + stream.game + ", " + stream.channel.status + ": " + stream.channel.url);
      }
      streamers[streamer].live = true;
    });
    var offlineStremers = config.channels.filter(function(streamer) { return onlineStreamers.indexOf(streamer) < 0; });
    offlineStremers.forEach(function (streamer) {
      if (streamers[streamer].live) {
        streamers[streamer].live = false;
      }
    });
    log.debug(streamers);
  });
};

var bot = new irc.Client(config.irc);
initialiseStreamers();

bot.connect(function (client) {
  log.info("loaxor connected");
  client.join("#leftoutsidealone", function (err, channel) {
    if (err) {
      log.error("Could not join channel :(", err);
      return;
    }
    log.info("Joined #leftoutsidealone");
    setInterval(updateStreamersStatus, 30000, channel);
  });
});

bot.match("INVITE", function(msg) {
  msg.reply("Joining.");
  bot.join(msg.params[1]);
});

bot.match(/.*/, function(msg) {
  log.debug(msg.from, msg.params);
});
