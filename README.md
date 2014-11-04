# good-http

Http(s) broadcasting for Good process monitor using [GELF](http://www.graylog2.org/resources/gelf) format


Lead Maintainer: [Sergey Rodovinsky](https://github.com/jeltok)

## Usage

`good-http-gelf` is a [good-reporter](https://github.com/hapijs/good-reporter) implementation to write [hapi](http://hapijs.com/) server events to remote endpoints. It makes a "POST" request with a JSON payload to the supplied `endpoint`.

## Good Http GELF
### new GoodHttpGelf (endpoint, events, [options])

creates a new GoodFile object with the following arguments
- `endpoint` - full path to remote server to transmit logs.
- `events` - an object of key value pairs.
  - `key` - one of the supported [good events](https://github.com/hapijs/good) indicating the hapi event to subscribe to
  - `value` - a single string or an array of strings to filter incoming events. "\*" indicates no filtering. `null` and `undefined` are assumed to be "\*"
- `[options]` - optional arguments object
	- `threshold` - number of events to hold before transmission. Defaults to `20`. Set to `0` to have every event start transmission instantly. It is strongly suggested to have a set threshold to make data transmission more efficient.
    - `[wreck]` - configuration object to pass into [`wreck`](https://github.com/hapijs/wreck#advanced). Defaults to `{ timeout: 60000, headers: {} }`. `content-type` is always "application/json".

### GoodHttpGelf Methods
`good-file` implements the [good-reporter](https://github.com/hapijs/good-reporter) interface as has no additional public methods.

- `stop()` - `GoodHttp` will make a final attempt to transmit anything remaining in it's internal event queue when `stop` is called.

### Schema
Each POST will match the following schema. Every event will be wrapped inside the `events` key and grouped by the event type and ordered by the timestamp. The payload that is POSTed to the `endpoint` has the following schema:

```json
{
  "host":"servername.home",
  "schema":"good-http",
  "timeStamp":1412710565121,
  "events":{
    "request":[
      {
        "event":"request",
        "timestamp":1413464014739,
        ...
      },
      {
        "event":"request",
        "timestamp":1414221317758,
        ...
      },
      {
        "event":"request",
        "timestamp":1415088216608,
        ...
      }
    ],
    "log":[
      {
        "event":"log",
        "timestamp":1415180913160,
        ...
      },
      {
        "event":"log",
        "timestamp":1422493874390,
        ...
      }
    ]
  }
}
```
