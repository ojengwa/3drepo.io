/**
 *	Copyright (C) 2015 3D Repo Ltd
 *
 *	This program is free software: you can redistribute it and/or modify
 *	it under the terms of the GNU Affero General Public License as
 *	published by the Free Software Foundation, either version 3 of the
 *	License, or (at your option) any later version.
 *
 *	This program is distributed in the hope that it will be useful,
 *	but WITHOUT ANY WARRANTY; without even the implied warranty of
 *	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *	GNU Affero General Public License for more details.
 *
 *	You should have received a copy of the GNU Affero General Public License
 *	along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/***************************************************************************
 *  @file Contains functionality to dispatch work to the
 *       queue via amqp protocol. A compute node with a worker must be running
 *       to fulfil the tasks in order for the work to be done.
 ****************************************************************************/
(() => {
	"use strict";

	const amqp = require("amqplib");
	const fs = require("fs.extra");
	const uuid = require("node-uuid");
	const shortid = require("shortid");
	const systemLogger = require("../logger.js").systemLogger;

	function ImportQueue() {}

	/*******************************************************************************
	 * Create a connection and a channel in ampq and init variables
	 * @param {url} url - ampq connection string
	 * @param {options} options - defines sharedSpacePath, logger, callbackQName and workerQName
	 *******************************************************************************/
	ImportQueue.prototype.connect = function (url, options) {
		if (this.conn) {
			return Promise.resolve();
		}

		this.uid = shortid.generate();

		if (!options.shared_storage) {
			return Promise.reject({ message: "Please define shared_storage in queue config" });
		} else if (!options.logger) {
			return Promise.reject({ message: "Please define logger in options" });
		} else if (!options.callback_queue) {
			return Promise.reject({ message: "Please define callback_queue in queue config" });
		} else if (!options.worker_queue) {
			return Promise.reject({ message: "Please define worker_queue in queue config" });
		} else if (!options.event_exchange) {
			return Promise.reject({ message: "Please define event_exchange in queue config" });
		}

		return amqp.connect(url)
			.then(conn => {
				this.conn = conn;

				conn.on("close", () => {
					this.conn = null;
				});

				conn.on("error", function (err) {
					systemLogger.logError("[AMQP] connection error " + err.message);
				});

				return conn.createChannel();
			})
			.then(channel => {
				this.channel = channel;
				this.sharedSpacePath = options.shared_storage;
				this.logger = options.logger;
				this.callbackQName = options.callback_queue;
				this.workerQName = options.worker_queue;
				this.deferedObjs = {};
				this.eventExchange = options.event_exchange;

				return this._consumeCallbackQueue();
			})
			.catch(err => {
				return Promise.reject(err);
			});
	};

	/*******************************************************************************
	 * Dispatch work to queue to import a model via a file uploaded by User
	 * @param {filePath} filePath - Path to uploaded file
	 * @param {orgFileName} orgFileName - Original file name of the file
	 * @param {databaseName} databaseName - name of database to commit to
	 * @param {projectName} projectName - name of project to commit to
	 * @param {userName} userName - name of user
	 * @param {copy} copy - use fs.copy or fs.move, default fs.move
	 * @param {tag} tag - revision tag
	 * @param {desc} desc - revison description
	 *******************************************************************************/
	ImportQueue.prototype.importFile = function (filePath, orgFileName, databaseName, projectName, userName, copy, tag, desc) {
		let corID = uuid.v1();

		let newPath;
		let newFileDir;
		let jsonFilename = `${this.sharedSpacePath}/${corID}.json`;

		return this._moveFileToSharedSpace(corID, filePath, orgFileName, copy)
			.then(obj => {
				newPath = obj.filePath;
				newFileDir = obj.newFileDir;

				let json = {
					file: newPath,
					database: databaseName,
					project: projectName,
					owner: userName,
				};

				if (tag) {
					json.tag = tag;
				}

				if (desc) {
					json.desc = desc;
				}

				return new Promise((resolve, reject) => {
					fs.writeFile(jsonFilename, JSON.stringify(json), { flag: "a+" }, err => {
						if (err) {
							reject(err);
						} else {
							resolve();
						}
					});
				});

			})
			.then(() => {
				let msg = `import -f ${jsonFilename}`;
				return this._dispatchWork(corID, msg);
			})
			.then(() => {
				return new Promise((resolve, reject) => {
					this.deferedObjs[corID] = {
						resolve: () => resolve({ corID, newPath, newFileDir, jsonFilename }),
						reject: errCode => reject({ corID, errCode, newPath, newFileDir, jsonFilename })
					};
				});
			});
	};

	/*******************************************************************************
	 * Dispatch work to queue to create a federated project
	 * @param {account} account - username
	 * @param {defObj} defObj - object to describe the federated project like subprojects and transformation
	 *******************************************************************************/
	ImportQueue.prototype.createFederatedProject = function (account, defObj) {
		let corID = uuid.v1();
		let newFileDir = this.sharedSpacePath + "/" + corID;
		let filename = `${newFileDir}/obj.json`;

		return new Promise((resolve, reject) => {
			fs.mkdir(this.sharedSpacePath, function (err) {
				if (!err || err && err.code === "EEXIST") {
					resolve();
				} else {
					reject(err);
				}
			});
		})
		.then(() => {
			return new Promise((resolve, reject) => {
				fs.mkdir(newFileDir, function (err) {
					if (err) {
						reject(err);
					} else {
						resolve();
					}
				});

			});
		})
		.then(() => {
			return new Promise((resolve, reject) => {
				fs.writeFile(filename, JSON.stringify(defObj), { flag: "a+" }, err => {
					if (err) {
						reject(err);
					} else {
						resolve();
					}
				});
			});
		})
		.then(() => {
			let msg = `genFed ${filename} ${account}`;
			return this._dispatchWork(corID, msg);
		})
		.then(() => {
			return new Promise((resolve, reject) => {
				this.deferedObjs[corID] = {
					resolve: () => resolve({corID, newFileDir, jsonFilename: filename}),
					reject: errCode => reject({ corID, errCode, newFileDir, jsonFilename: filename })
				};
			});

		});

	};

	/*******************************************************************************
	 * Dispatch work to regenerate a project's tree
	 * @param {account} account - username
	 * @param {defObj} defObj - object to describe the federated project like subprojects and transformation
	 *******************************************************************************/
	ImportQueue.prototype.reGenProjectTree = function (database, project) {
		let corID = uuid.v1();


		let msg = `genStash ${database} ${project} tree`;
		
		return this._dispatchWork(corID, msg).then(() => {

			return new Promise((resolve, reject) => {
				this.deferedObjs[corID] = {
					resolve: () => resolve({corID, database, project}),
					reject: errCode => reject({ corID, errCode, database, project })
				};
			});
		});
	};

	/*******************************************************************************
	 * Move a specified file to shared storage (area shared by queue workers)
	 * move the file to shared storage space, put it in a corID/newFileName
	 * note: using move(in fs.extra) instead of rename(in fs) as rename doesn"t allow cross device
	 * @param {corID} corID - Correlation ID
	 * @param {orgFilePath} orgFilePath - Path to where the file is currently
	 * @param {newFileName} newFileName - New file name to rename to
	 * @param {copy} copy - use fs.copy instead of fs.move if set to true
	 *******************************************************************************/
	ImportQueue.prototype._moveFileToSharedSpace = function (corID, orgFilePath, newFileName, copy) {
		let ProjectHelper = require("../models/helper/project");

		newFileName = newFileName.replace(ProjectHelper.fileNameRegExp, "_");

		let newFileDir = this.sharedSpacePath + "/" + corID + "/";
		let filePath = newFileDir + newFileName;

		return new Promise((resolve, reject) => {
			fs.mkdir(newFileDir, function (err) {
				if (err) {
					reject(err);
				} else {

					let move = copy ? fs.copy : fs.move;

					move(orgFilePath, filePath, function (err) {
						if (err) {
							reject(err);
						} else {
							resolve({ filePath, newFileDir });
						}
					});
				}

			});
		});

	};

	/*******************************************************************************
	 * Insert a job item in worker queue
	 *
	 * @param {corID} corID - Correlation ID
	 * @param {msg} orgFilePath - Path to where the file is currently
	 *******************************************************************************/
	ImportQueue.prototype._dispatchWork = function (corID, msg) {
		let info;
		return this.channel.assertQueue(this.workerQName, { durable: true })
			.then(_info => {
				info = _info;

				return this.channel.sendToQueue(this.workerQName,
					new Buffer(msg), {
						correlationId: corID,
						appId: this.uid,
						persistent: true
					}
				);

			})
			.then(() => {
				this.logger.logInfo(
					"Sent work to queue[" + this.workerQName + "]: " + msg.toString() + " with corr id: " + corID.toString() + " reply queue: " + this.callbackQName, {
						corID: corID.toString()
					}
				);

				if (info.consumerCount <= 0) {
					this.logger.logError(
						`No consumer found in the queue`, {
							corID: corID.toString()
						}
					);
				}

				return Promise.resolve(() => {});
			});

	};

	/*******************************************************************************
	 * Listen to callback queue, resolve promise when job done
	 * Should be called once only, presumably in constructor
	 *******************************************************************************/
	ImportQueue.prototype._consumeCallbackQueue = function () {
		let self = this;
		let queue;

		return this.channel.assertExchange(this.callbackQName, "direct", { durable: true })
			.then(() => {

				return this.channel.assertQueue("", { exclusive: true });

			})
			.then((q) => {

				queue = q.queue;
				return this.channel.bindQueue(queue, this.callbackQName, this.uid);

			})
			.then(() => {

				return this.channel.consume(queue, function (rep) {

					self.logger.logInfo("Job request id " + rep.properties.correlationId + " returned with: " + rep.content);

					let defer = self.deferedObjs[rep.properties.correlationId];

					let resErrorCode = parseInt(JSON.parse(rep.content)
						.value);

					if (defer && resErrorCode === 0) {
						defer.resolve();
					} else if (defer) {
						defer.reject(resErrorCode);
					} else {
						self.logger.logError("Job done but cannot find corresponding defer object with cor id " + rep.properties.correlationId);
					}

					defer && delete self.deferedObjs[rep.properties.correlationId];

				}, { noAck: true });
			});
	};

	ImportQueue.prototype.insertEventMessage = function (msg) {
		
		if(!this.channel){
			return;
		}

		msg = JSON.stringify(msg);

		return this.channel.assertExchange(this.eventExchange, "fanout", {
				durable: true
			})
			.then(() => {
				return this.channel.publish(
					this.eventExchange,
					"",
					new Buffer(msg), {
						persistent: true
					}
				);
			});
	};

	ImportQueue.prototype.consumeEventMessage = function (callback) {
		let queue;

		return this.channel.assertExchange(this.eventExchange, "fanout", {
				durable: true
			})
			.then(() => {

				return this.channel.assertQueue("", { exclusive: true });

			})
			.then(q => {

				queue = q.queue;
				return this.channel.bindQueue(queue, this.eventExchange, "");

			})
			.then(() => {

				return this.channel.consume(queue, function (rep) {

					callback(JSON.parse(rep.content));

				}, { noAck: true });
			});
	};

	module.exports = new ImportQueue();

})();