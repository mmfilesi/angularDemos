angular.module('ct.ui.router.extras').provider('$futureState',
  [ '$stateProvider', '$urlRouterProvider', '$urlMatcherFactoryProvider',
    function _futureStateProvider($stateProvider, $urlRouterProvider, $urlMatcherFactory) {
      var stateFactories = {}, futureStates = {};
      var transitionPending = false, resolveFunctions = [], initPromise, initDone = false;
      var provider = this;

      // This function registers a promiseFn, to be resolved before the url/state matching code
      // will reject a route.  The promiseFn is injected/executed using the runtime $injector.
      // The function should return a promise.
      // When all registered promises are resolved, then the route is re-sync'ed.

      // Example: function($http) {
      //  return $http.get('//server.com/api/DynamicFutureStates').then(function(data) {
      //    angular.forEach(data.futureStates, function(fstate) { $futureStateProvider.futureState(fstate); });
      //  };
      // }
      this.addResolve = function (promiseFn) {
        resolveFunctions.push(promiseFn);
      };

      // Register a state factory function for a particular future-state type.  This factory, given a future-state object,
      // should create a ui-router state.
      // The factory function is injected/executed using the runtime $injector.  The future-state is injected as 'futureState'.

      // Example:
      //    $futureStateProvider.stateFactory('test', function(futureState) {
      //      return {
      //        name: futureState.stateName,
      //        url: futureState.urlFragment,
      //        template: '<h3>Future State Template</h3>',
      //        controller: function() {
      //          console.log("Entered state " + futureState.stateName);
      //        }
      //      }
      //    });
      this.stateFactory = function (futureStateType, factory) {
        stateFactories[futureStateType] = factory;
      };

      this.futureState = function (futureState) {
        if (futureState.stateName)  // backwards compat for now
          futureState.name = futureState.stateName;
        if (futureState.urlPrefix)  // backwards compat for now
          futureState.url = "^" + futureState.urlPrefix;

        futureStates[futureState.name] = futureState;
        var parentMatcher,  parentName = futureState.name.split(/\./).slice(0, -1).join("."),
          realParent = findState(futureState.parent || parentName);
        if (parentName === "") {
          parentMatcher = $urlMatcherFactory.compile("");
        } else if (realParent) {
          parentMatcher = realParent.navigable.url;
        } else {
          var futureParent = findState((futureState.parent || parentName), true);
          if (!futureParent) throw new Error("Couldn't determine parent state of future state. FutureState:" + angular.toJson(futureState));
          var pattern = futureParent.urlMatcher.source.replace(/\*rest$/, "");
          parentMatcher = $urlMatcherFactory.compile(pattern);
          futureState.parentFutureState = futureParent;
        }
        futureState.urlMatcher = futureState.url.charAt(0) === "^" ?
          $urlMatcherFactory.compile(futureState.url.substring(1) + "*rest") :
          parentMatcher.concat(futureState.url + "*rest");
      };

      this.get = function () {
        return angular.extend({}, futureStates);
      };

      function findState(stateOrName, findFutureState) {
        var statename = angular.isObject(stateOrName) ? stateOrName.name : stateOrName;
        return !findFutureState ? internalStates[statename] : futureStates[statename];
      }

      /* options is an object with at least a name or url attribute */
      function findFutureState($state, options) {
        if (options.name) {
          var nameComponents = options.name.split(/\./);
          if (options.name.charAt(0) === '.')
            nameComponents[0] = $state.current.name;
          while (nameComponents.length) {
            var stateName = nameComponents.join(".");
            if ($state.get(stateName, { relative: $state.current }))
              return null; // State is already defined; nothing to do
            if (futureStates[stateName])
              return futureStates[stateName];
            nameComponents.pop();
          }
        }

        if (options.url) {
          var matches = [];
          for(var future in futureStates) {
            if (futureStates[future].urlMatcher.exec(options.url)) {
              matches.push(futureStates[future]);
            }
          }
          // Find most specific by ignoring matching parents from matches
          var copy = matches.slice(0);
          for (var i = matches.length - 1; i >= 0; i--) {
            for (var j = 0; j < copy.length; j++) {
              if (matches[i] === copy[j].parentFutureState) matches.splice(i, 1);
            }
          }
          return matches[0];
        }
      }

      function lazyLoadState($injector, futureState) {
        var $q = $injector.get("$q");
        if (!futureState) {
          var deferred = $q.defer();
          deferred.reject("No lazyState passed in " + futureState);
          return deferred.promise;
        }

        var promise = $q.when([]), parentFuture = futureState.parentFutureState;
        if (parentFuture && futureStates[parentFuture.name]) {
          promise = lazyLoadState($injector, futureStates[parentFuture.name]);
        }

        var type = futureState.type;
        var factory = stateFactories[type];
        if (!factory) throw Error("No state factory for futureState.type: " + (futureState && futureState.type));
        return promise
          .then(function(array) {
            var injectorPromise = $injector.invoke(factory, factory, { futureState: futureState });
            return injectorPromise.then(function(fullState) {
              if (fullState) { array.push(fullState); } // Pass a chain of realized states back
              return array;
            });
          })
          ["finally"](function() { // IE8 hack
            delete(futureStates[futureState.name]);
          });
      }

      var otherwiseFunc = [ '$log', '$location',
        function otherwiseFunc($log, $location) {
          $log.debug("Unable to map " + $location.path());
        }];

      function futureState_otherwise($injector, $location) {
        var resyncing = false;

        var lazyLoadMissingState =
          ['$rootScope', '$urlRouter', '$state',
            function lazyLoadMissingState($rootScope, $urlRouter, $state) {
              if (!initDone) {
                // Asynchronously load state definitions, then resync URL
                initPromise().then(function initialResync() {
                  resyncing = true;
                  $urlRouter.sync();
                  resyncing = false;
                });
                initDone = true;
                return;
              }

              var futureState = findFutureState($state, { url: $location.path() });
              if (!futureState) {
                return $injector.invoke(otherwiseFunc);
              }

              transitionPending = true;
              // Config loaded.  Asynchronously lazy-load state definition from URL fragment, if mapped.
              lazyLoadState($injector, futureState).then(function lazyLoadedStateCallback(states) {
                states.forEach(function (state) {
                  if (state && (!$state.get(state) || (state.name && !$state.get(state.name))))
                    $stateProvider.state(state);
                });
                resyncing = true;
                $urlRouter.sync();
                resyncing = false;
                transitionPending = false;
              }, function lazyLoadStateAborted() {
                transitionPending = false;
                return $injector.invoke(otherwiseFunc);
              });
            }];
        if (transitionPending) return;

        var nextFn = resyncing ? otherwiseFunc : lazyLoadMissingState;
        return $injector.invoke(nextFn);
      }

      $urlRouterProvider.otherwise(futureState_otherwise);

      $urlRouterProvider.otherwise = function(rule) {
        if (angular.isString(rule)) {
          var redirect = rule;
          rule = function () { return redirect; };
        }
        else if (!angular.isFunction(rule)) throw new Error("'rule' must be a function");
        otherwiseFunc = rule;
        return $urlRouterProvider;
      }; 

      var serviceObject = {
        getResolvePromise: function () {
          return initPromise();
        }
      };

      // Used in .run() block to init
      this.$get = [ '$injector', '$state', '$q', '$rootScope', '$urlRouter', '$timeout', '$log',
        function futureStateProvider_get($injector, $state, $q, $rootScope, $urlRouter, $timeout, $log) {
          function init() {
            $rootScope.$on("$stateNotFound", function futureState_notFound(event, unfoundState, fromState, fromParams) {
              if (transitionPending) return;
              $log.debug("event, unfoundState, fromState, fromParams", event, unfoundState, fromState, fromParams);

              var futureState = findFutureState($state, { name: unfoundState.to });
              if (!futureState) return;

              event.preventDefault();
              transitionPending = true;

              var promise = lazyLoadState($injector, futureState);
              promise.then(function (states) {
                states.forEach(function (state) {
                  if (state && (!$state.get(state) || (state.name && !$state.get(state.name))))
                    $stateProvider.state(state);
                });
                $state.go(unfoundState.to, unfoundState.toParams);
                transitionPending = false;
              }, function (error) {
                console.log("failed to lazy load state ", error);
                $state.go(fromState, fromParams);
                transitionPending = false;
              });
            });

            // Do this better.  Want to load remote config once, before everything else
            if (!initPromise) {
              var promises = [];
              angular.forEach(resolveFunctions, function (promiseFn) {
                promises.push($injector.invoke(promiseFn));
              });
              initPromise = function () {
                return $q.all(promises);
              };
//          initPromise = _.once(function flattenFutureStates() {
//            var allPromises = $q.all(promises);
//            return allPromises.then(function(data) { 
//              return _.flatten(data); 
//            });
//          });
            }

            // TODO: analyze this. I'm calling $urlRouter.sync() in two places for retry-initial-transition.
            // TODO: I should only need to do this once.  Pick the better place and remove the extra resync.
            initPromise().then(function retryInitialState() {
              $timeout(function () {
                if ($state.transition) {
                  $state.transition.then($urlRouter.sync, $urlRouter.sync);
                } else {
                  $urlRouter.sync();
                }
              });
            });
          }

          init();

          serviceObject.state = $stateProvider.state;
          serviceObject.futureState = provider.futureState;
          serviceObject.get = provider.get;

          return serviceObject;
        }];
    }]);

angular.module('ct.ui.router.extras').run(['$futureState',
  // Just inject $futureState so it gets initialized.
  function ($futureState) {
  }
]);
