var fs = require('fs');
var irc = require('irc-js');
var config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

irc.connect(config, function (bot) {
  console.log('loaxxor connected');
  bot.join('#leftoutsidealone', function (err, chan) {
    console.log('Joining #leftoutsidealone ...');
    if (err) {
      console.log('Could not join channel :(', err);
      return;
    }
    console.log('Joined #leftoutsidealone');
  });
});
