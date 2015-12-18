/**
 *  Copyright (C) 2015 3D Repo Ltd
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as
 *  published by the Free Software Foundation, either version 3 of the
 *  License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

(function () {
	"use strict";

	angular.module("3drepo")
		.factory("DocsService", DocsService);

	DocsService.$inject = ["$http", "$q", "StateManager", "serverConfig"];

	function DocsService($http, $q, StateManager, serverConfig) {
		var metadocs = {},
			loadingPromise = null,
			loading = false,
			currentLoadingID = null;

		var getObjectMetaData = function (object)
		{
			// TODO: Will break when the account is not same, as part of a federation.
			var account = StateManager.state.account;

			var objectIDParts = object.id.split("__");
			var numIDParts    = objectIDParts.length;

			var project = objectIDParts[numIDParts - 2];

			if (project === "model") {
				project = StateManager.state.project;
			}

			var uid = objectIDParts[numIDParts - 1];
			var baseUrl = serverConfig.apiUrl(account + "/" + project + "/meta/" + uid + ".json");

			if (!loading)
			{
				loading = true;
				currentLoadingID = uid;
				var deferred = $q.defer();

				loadingPromise = deferred.promise;

				metadocs = {};

				$http.get(baseUrl)
					.then(function(json) {
						var meta = json.data.meta;

						for(var i = 0; i < meta.length; i++)
						{
							var subtype = meta[i].mime ? meta[i].mime : "metadata";

							if (!metadocs[subtype]) {
								metadocs[subtype] = [];
							}

							meta[i].url = serverConfig.apiUrl(account + "/" + project + "/" + meta[i]._id + ".pdf");

							metadocs[subtype].push(meta[i]);
						}

						loading = false;
						currentLoadingID = null;
						deferred.resolve();
					}, function() {
						loading = false;
						currentLoadingID = null;
						deferred.resolve();
					});
			} else {
				if (uid !== currentLoadingID)
				{
					loadingPromise.then(function () {
						getObjectMetaData(object);
					});
				}
			}
		};

		var getDocs = function (objectId) {
			var deferred = $q.defer(),
				url = serverConfig.apiUrl(StateManager.state.account + "/" + "pdf" + "/meta/" + objectId + ".json");

			$http.get(url)
				.then(function(json) {
					/*
					var meta = json.data.meta;

					for(var i = 0; i < meta.length; i++)
					{
						var subtype = meta[i].mime ? meta[i].mime : "metadata";

						if (!metadocs[subtype]) {
							metadocs[subtype] = [];
						}

						meta[i].url = serverConfig.apiUrl(account + "/" + project + "/" + meta[i]._id + ".pdf");

						metadocs[subtype].push(meta[i]);
					}
					*/
					deferred.resolve(json.data);
				});

			return deferred.promise;
		};

		return {
			getDocs: getDocs
		};
	}
}());