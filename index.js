// require('newrelic');

let app = require('express')(),
  XboxLiveApi = require('./xbox-live-api.js'),
  request = require('request');

let xboxUser = process.env.XBOXUSER;
let xboxPass = process.env.XBOXPASS;

let xla = new XboxLiveApi(xboxUser, xboxPass);

app.set('port', (process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 5000));
app.set('ip', (process.env.IP || process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0'));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.get('/api/clips/:gamertag', (req, res) => {
  let gamertag = req.params.gamertag;

  xla.getClipsForGamerRequest(gamertag, (clipsRequest) => {
    if (clipsRequest) {
      request(clipsRequest)
        .on('error', (e) => res.end('Error retrieving clips for ' + gamertag + '.'))
        .pipe(res);
    } else {
      res.end('Error retrieving clips for ' + gamertag + '.');
    }
  });
});

app.get('/ping', (req, res) => {
  res.end('ping');
});

app.listen(app.get('port'), app.get('ip'));
console.log('Server running on http://%s:%s', app.get('ip'), app.get('port'));