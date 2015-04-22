'use strict';

var fs = require('fs');
var irc = require('irc-js');
var config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
var twitch = require('twitch.tv');

var twitchConfig = {
  ua: 'loaxor by deiga',
  apiVersion: '3',
  clientID: ''
};

var streamers = {
  deiga: {
    live: false
  },
  eiwaz: {
    live: false
  },
  seqone: {
    live: false
  },
  peacemakex: {
    live: false
  }
};

var updateStreamersStatus = function (channel) {
  console.log('Updating...');
  twitch('streams?channel=deiga,eiwaz,peacemakex,seqone', twitchConfig, function (err, res) {
    if (err) {
      console.log('ERROR Something bad happened :(', err);
      return;
    }
    var streams = res.streams;
    var onlineStreamers = [];
    streams.forEach( function (stream) {
      var streamer = stream.channel.name;
      onlineStreamers.push(streamer);
      if (!streamers[streamer].live) {
        console.log(streamer + ' just went live!');
        channel.say(streamer + ' just went live!');
      }
      streamers[streamer].live = true;
    });
    var offlineStremers = Object.keys(streamers).filter(function(i) {return onlineStreamers.indexOf(i) < 0;});
    offlineStremers.forEach(function (streamer) {
      streamers[streamer].live = false;
      channel.say(streamer + ' just went offline!');
    });
    console.log(streamers);
  });
};
var bot = new irc.Client(config);

bot.connect(function (client) {
  console.log('INFO loaxor connected');
  client.join('#leftoutsidealone', function (err, channel) {
    if (err) {
      console.log('ERROR Could not join channel :(', err);
      return;
    }
    console.log('INFO Joined #leftoutsidealone');
    setInterval(updateStreamersStatus, 30000, channel);
  });

});
