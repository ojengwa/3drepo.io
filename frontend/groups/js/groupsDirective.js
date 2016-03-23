/**
 *	Copyright (C) 2016 3D Repo Ltd
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

(function () {
	"use strict";

	angular.module("3drepo")
		.directive("groups", groups);

	function groups() {
		return {
			restrict: 'EA',
			templateUrl: 'groups.html',
			scope: {
				show: "=",
				showAdd: "=",
				onContentHeightRequest: "&",
				onShowItem : "&",
				hideItem: "="
			},
			controller: GroupsCtrl,
			controllerAs: 'vm',
			bindToController: true
		};
	}

	GroupsCtrl.$inject = ["$scope"];

	function GroupsCtrl ($scope) {
		var vm = this;
		
		/*
		 * Init
		 */
		vm.showGroups = true;
		vm.saveDisabled = true;
		vm.groups = [
			{name: "Doors"},
			{name: "Toilets"},
			{name: "Windows"}
		];
		setContentHeight();

		/*
		 * Handle showing of adding a new issue
		 */
		$scope.$watch("vm.showAdd", function (newValue) {
			if (angular.isDefined(newValue) && newValue) {
				vm.showGroups = false;
				vm.onShowItem();
				setContentHeight();
			}
		});

		/*
		 * Handle parent notice to hide a selected group or add group
		 */
		$scope.$watch("vm.hideItem", function (newValue) {
			if (angular.isDefined(newValue) && newValue) {
				vm.showGroups = true;
				vm.showAdd = false;
				setContentHeight();
			}
		});

		/*
		 * Save button disabled when no name is input
		 */
		$scope.$watch("vm.name", function (newValue) {
			if (angular.isDefined(newValue)) {
				vm.saveDisabled = (angular.isUndefined(newValue) || (newValue.toString() === ""));
			}
		});

		/**
		 * Show the group details and highlight the group objects
		 *
		 * @param index
		 */
		vm.showGroup = function (index) {

		};

		/**
		 * Set the height of the content
		 */
		function setContentHeight () {
			var contentHeight = 0,
				groupHeaderHeight = 60, // It could be higher for items with long text but ignore that
				addHeight = 190;

			if (vm.showAdd) {
				contentHeight = addHeight;
			}
			else if (vm.showGroups) {
				angular.forEach(vm.groups, function() {
					contentHeight += groupHeaderHeight;
				});
			}

			vm.onContentHeightRequest({height: contentHeight});
		}
	}
}());