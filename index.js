"use strict";
var t0 = Date.now();

var express = require("express"),
    bl = require("bl"),
    labelModel = require('./lib/label-model'),
    metadata = require('./lib/metadata'),
    comment = require('./lib/comment'),
    rmReviewable = require('./lib/rm-reviewable'),
    github = require('./lib/github'),
    checkRequest = require('./lib/check-request'),
    isProcessed = require('./lib/is-processed');


var app = module.exports = express();

function logArgs() {
    var args = arguments;
    process.nextTick(function() {
        console.log.apply(console, args);
    });
}

app.post('/github-hook', function (req, res, next) {
	req.pipe(bl(function (err, body) {
    	if (err) {
        	logArgs(err.message);
		} else if (process.env.NODE_ENV != 'production' || checkRequest(body, req.headers["x-hub-signature"], process.env.GITHUB_SECRET)) {
		    res.send(new Date().toISOString());
	        body = JSON.parse(body);
	        if (body && body.pull_request) {
                var n = body.pull_request.number;
                var u = (body.pull_request.user && body.pull_request.user.login) || null;
                var content = body.pull_request.body || "";
				console.log(n, body.action)
                
                if (body.action == "edited" && body.sender && body.sender.login != WPT_PR_BOT) {
	                metadata(n, u, content).then(function(metadata) {
                        logArgs(metadata);
                        return rmReviewable(n, metadata).then(logArgs).catch(logArgs);
                    });
                } else if (body.action == "opened" || body.action == "synchronize") {
	                metadata(n, u, content).then(function(metadata) {
						logArgs(metadata);
						return labelModel.post(n, metadata.labels).then(function() {
							if (body.action == "opened") {
								return comment(n, metadata).then(function() {
                                    return rmReviewable(n, metadata);
                                }).then(logArgs);
							}
						});
					}).then(logArgs).catch(logArgs);
	            } else {
	                metadata(n, u, content).then(logArgs, logArgs);
	            }
	        } else if (body && body.comment && body.action == "created" && (body.issue || body.pull_request)) {
                var data = (body.issue || body.pull_request);
                var n = data.number;
                var u = (data.user && data.user.login) || null;
                var content = data.body || "";
                isProcessed(n).then(function(processed) {
                    if (processed) {
                        console.log("#" + n + " has already been processed.");
                    } else if (body.issue.pull_request && !body.issue.pull_request.merged) {
                        metadata(n, u, content).then(function(metadata) {
                            logArgs(metadata);
                            return labelModel.post(n, metadata.labels).then(function() {
                                return comment(n, metadata).then(function() {
                                    return rmReviewable(n, metadata);
                                }).then(logArgs);
                            });
                        }).then(logArgs).catch(logArgs);
                    }
                });
            }
        } else {
            logArgs("Unverified request", req);
        }
    }));
});

var port = process.env.PORT || 5000;
app.listen(port, function() {
    console.log("Express server listening on port %d in %s mode", port, app.settings.env);
    console.log("App started in", (Date.now() - t0) + "ms.");
});
