/**
 * UI-Router Extras: Sticky states, Future States, Deep State Redirect, Transition promise
 * @version v0.0.11
 * @link http://christopherthielen.github.io/ui-router-extras/
 * @license MIT License, http://www.opensource.org/licenses/MIT
 */

(function (window, angular, undefined) {
angular.module("ct.ui.router.extras", [ 'ui.router' ]);


var DEBUG = false;

var forEach = angular.forEach;
var extend = angular.extend;
var isArray = angular.isArray;

var map = function (collection, callback) {
  "use strict";
  var result = [];
  forEach(collection, function (item, index) {
    result.push(callback(item, index));
  });
  return result;
};

var keys = function (collection) {
  "use strict";
  return map(collection, function (collection, key) {
    return key;
  });
};

var filter = function (collection, callback) {
  "use strict";
  var result = [];
  forEach(collection, function (item, index) {
    if (callback(item, index)) {
      result.push(item);
    }
  });
  return result;
};

var filterObj = function (collection, callback) {
  "use strict";
  var result = {};
  forEach(collection, function (item, index) {
    if (callback(item, index)) {
      result[index] = item;
    }
  });
  return result;
};

// Duplicates code in UI-Router common.js
function ancestors(first, second) {
  var path = [];

  for (var n in first.path) {
    if (first.path[n] !== second.path[n]) break;
    path.push(first.path[n]);
  }
  return path;
}

// Duplicates code in UI-Router common.js
function objectKeys(object) {
  if (Object.keys) {
    return Object.keys(object);
  }
  var result = [];

  angular.forEach(object, function (val, key) {
    result.push(key);
  });
  return result;
}

// Duplicates code in UI-Router common.js
function arraySearch(array, value) {
  if (Array.prototype.indexOf) {
    return array.indexOf(value, Number(arguments[2]) || 0);
  }
  var len = array.length >>> 0, from = Number(arguments[2]) || 0;
  from = (from < 0) ? Math.ceil(from) : Math.floor(from);

  if (from < 0) from += len;

  for (; from < len; from++) {
    if (from in array && array[from] === value) return from;
  }
  return -1;
}

// Duplicates code in UI-Router common.js
// Added compatibility code  (isArray check) to support both 0.2.x and 0.3.x series of UI-Router.
function inheritParams(currentParams, newParams, $current, $to) {
  var parents = ancestors($current, $to), parentParams, inherited = {}, inheritList = [];

  for (var i in parents) {
    if (!parents[i].params) continue;
    // This test allows compatibility with 0.2.x and 0.3.x (optional and object params)
    parentParams = isArray(parents[i].params) ? parents[i].params : objectKeys(parents[i].params);
    if (!parentParams.length) continue;

    for (var j in parentParams) {
      if (arraySearch(inheritList, parentParams[j]) >= 0) continue;
      inheritList.push(parentParams[j]);
      inherited[parentParams[j]] = currentParams[parentParams[j]];
    }
  }
  return extend({}, inherited, newParams);
}

function inherit(parent, extra) {
  return extend(new (extend(function () { }, {prototype: parent}))(), extra);
}

var ignoreDsr;
function resetIgnoreDsr() {
  ignoreDsr = undefined;
}

// Decorate $state.transitionTo to gain access to the last transition.options variable.
// This is used to process the options.ignoreDsr option
angular.module("ct.ui.router.extras").config([ "$provide", function ($provide) {
  var $state_transitionTo;
  $provide.decorator("$state", ['$delegate', '$q', function ($state, $q) {
    $state_transitionTo = $state.transitionTo;
    $state.transitionTo = function (to, toParams, options) {
      if (options.ignoreDsr) {
        ignoreDsr = options.ignoreDsr;
      }

      return $state_transitionTo.apply($state, arguments).then(
        function (result) {
          resetIgnoreDsr();
          return result;
        },
        function (err) {
          resetIgnoreDsr();
          return $q.reject(err);
        }
      );
    };
    return $state;
  }]);
}]);

angular.module("ct.ui.router.extras").service("$deepStateRedirect", [ '$rootScope', '$state', '$injector', function ($rootScope, $state, $injector) {
  var lastSubstate = {};
  var deepStateRedirectsByName = {};

  var REDIRECT = "Redirect", ANCESTOR_REDIRECT = "AncestorRedirect";

  function computeDeepStateStatus(state) {
    var name = state.name;
    if (deepStateRedirectsByName.hasOwnProperty(name))
      return deepStateRedirectsByName[name];
    recordDeepStateRedirectStatus(name);
  }

  function getConfig(state) {
    var declaration = state.deepStateRedirect;
    if (!declaration) return { dsr: false };
    var dsrCfg = { dsr: true };

    if (angular.isFunction(declaration))
      dsrCfg.fn = declaration;
    else if (angular.isObject(declaration))
      dsrCfg = angular.extend(dsrCfg, declaration);

    if (!dsrCfg.fn) {
      dsrCfg.fn = [ '$dsr$', function($dsr$) {
        return $dsr$.redirect.state != $dsr$.to.state;
      } ];
    }
    return dsrCfg;
  }

  function recordDeepStateRedirectStatus(stateName) {
    var state = $state.get(stateName);
    if (!state) return false;
    var cfg = getConfig(state);
    if (cfg.dsr) {
      deepStateRedirectsByName[state.name] = REDIRECT;
      if (lastSubstate[stateName] === undefined)
        lastSubstate[stateName] = {};
    }

    var parent = state.$$state && state.$$state().parent;
    if (parent) {
      var parentStatus = recordDeepStateRedirectStatus(parent.self.name);
      if (parentStatus && deepStateRedirectsByName[state.name] === undefined) {
        deepStateRedirectsByName[state.name] = ANCESTOR_REDIRECT;
      }
    }
    return deepStateRedirectsByName[state.name] || false;
  }

  function getParamsString(params, dsrParams) {
    function safeString(input) { return !input ? input : input.toString(); }
    if (dsrParams === true) dsrParams = Object.keys(params);
    if (dsrParams === null || dsrParams === undefined) dsrParams = [];

    var paramsToString = {};
    angular.forEach(dsrParams.sort(), function(name) { paramsToString[name] = safeString(params[name]); });
    return angular.toJson(paramsToString);
  }

  $rootScope.$on("$stateChangeStart", function (event, toState, toParams, fromState, fromParams) {
    if (ignoreDsr || computeDeepStateStatus(toState) !== REDIRECT) return;
    // We're changing directly to one of the redirect (tab) states.
    // Get the DSR key for this state by calculating the DSRParams option
    var cfg = getConfig(toState);
    var key = getParamsString(toParams, cfg.params);
    var redirect = lastSubstate[toState.name][key];
    if (!redirect) return;

    // we have a last substate recorded
    var $dsr$ = { redirect: { state: redirect.state, params: redirect.params}, to: { state: toState.name, params: toParams } };
    var result = $injector.invoke(cfg.fn, toState, { $dsr$: $dsr$ });
    if (!result) return;
    if (result.state) redirect = result;
    event.preventDefault();
    $state.go(redirect.state, redirect.params);
  });

  $rootScope.$on("$stateChangeSuccess", function (event, toState, toParams, fromState, fromParams) {
    var deepStateStatus = computeDeepStateStatus(toState);
    if (deepStateStatus) {
      var name = toState.name;
      angular.forEach(lastSubstate, function (redirect, dsrState) {
        // update Last-SubState&params for each DSR that this transition matches.
        var cfg = getConfig($state.get(dsrState));
        var key = getParamsString(toParams, cfg.params);
        if (name == dsrState || name.indexOf(dsrState + ".") != -1) {
          lastSubstate[dsrState][key] = { state: name, params: angular.copy(toParams) };
        }
      });
    }
  });

  return {
    reset: function(stateOrName) {
      if (!stateOrName) {
        angular.forEach(lastSubstate, function(redirect, dsrState) { lastSubstate[dsrState] = {}; });
      } else {
        var state = $state.get(stateOrName);
        if (!state) throw new Error("Unknown state: " + stateOrName);
        if (lastSubstate[state.name])
          lastSubstate[state.name] = {};
      }
    }
  };
}]);

angular.module("ct.ui.router.extras").run(['$deepStateRedirect', function ($deepStateRedirect) {
  // Make sure $deepStateRedirect is instantiated
}]);

$StickyStateProvider.$inject = [ '$stateProvider' ];
function $StickyStateProvider($stateProvider) {
  // Holds all the states which are inactivated.  Inactivated states can be either sticky states, or descendants of sticky states.
  var inactiveStates = {}; // state.name -> (state)
  var stickyStates = {}; // state.name -> true
  var $state;

  // Called by $stateProvider.registerState();
  // registers a sticky state with $stickyStateProvider
  this.registerStickyState = function (state) {
    stickyStates[state.name] = state;
    // console.log("Registered sticky state: ", state);
  };

  this.enableDebug = function (enabled) {
    DEBUG = enabled;
  };

  this.$get = [  '$rootScope', '$state', '$stateParams', '$injector', '$log',
    function ($rootScope, $state, $stateParams, $injector, $log) {
      // Each inactive states is either a sticky state, or a child of a sticky state.
      // This function finds the closest ancestor sticky state, then find that state's parent.
      // Map all inactive states to their closest parent-to-sticky state.
      function mapInactives() {
        var mappedStates = {};
        angular.forEach(inactiveStates, function (state, name) {
          var stickyAncestors = getStickyStateStack(state);
          for (var i = 0; i < stickyAncestors.length; i++) {
            var parent = stickyAncestors[i].parent;
            mappedStates[parent.name] = mappedStates[parent.name] || [];
            mappedStates[parent.name].push(state);
          }
          if (mappedStates['']) {
            // This is necessary to compute Transition.inactives when there are sticky states are children to root state.
            mappedStates['__inactives'] = mappedStates[''];  // jshint ignore:line
          }
        });
        return mappedStates;
      }

      // Given a state, returns all ancestor states which are sticky.
      // Walks up the view's state's ancestry tree and locates each ancestor state which is marked as sticky.
      // Returns an array populated with only those ancestor sticky states.
      function getStickyStateStack(state) {
        var stack = [];
        if (!state) return stack;
        do {
          if (state.sticky) stack.push(state);
          state = state.parent;
        } while (state);
        stack.reverse();
        return stack;
      }

      // Used by processTransition to determine if what kind of sticky state transition this is.
      // returns { from: (bool), to: (bool) }
      function getStickyTransitionType(fromPath, toPath, keep) {
        if (fromPath[keep] === toPath[keep]) return { from: false, to: false };
        var stickyFromState = keep < fromPath.length && fromPath[keep].self.sticky;
        var stickyToState = keep < toPath.length && toPath[keep].self.sticky;
        return { from: stickyFromState, to: stickyToState };
      }

      // Returns a sticky transition type necessary to enter the state.
      // Transition can be: reactivate, updateStateParams, or enter

      // Note: if a state is being reactivated but params dont match, we treat
      // it as a Exit/Enter, thus the special "updateStateParams" transition.
      // If a parent inactivated state has "updateStateParams" transition type, then
      // all descendant states must also be exit/entered, thus the first line of this function.
      function getEnterTransition(state, stateParams, ancestorParamsChanged) {
        if (ancestorParamsChanged) return "updateStateParams";
        var inactiveState = inactiveStates[state.self.name];
        if (!inactiveState) return "enter";
//      if (inactiveState.locals == null || inactiveState.locals.globals == null) debugger;
        var paramsMatch = equalForKeys(stateParams, inactiveState.locals.globals.$stateParams, state.ownParams);
//      if (DEBUG) $log.debug("getEnterTransition: " + state.name + (paramsMatch ? ": reactivate" : ": updateStateParams"));
        return paramsMatch ? "reactivate" : "updateStateParams";
      }

      // Given a state and (optional) stateParams, returns the inactivated state from the inactive sticky state registry.
      function getInactivatedState(state, stateParams) {
        var inactiveState = inactiveStates[state.name];
        if (!inactiveState) return null;
        if (!stateParams) return inactiveState;
        var paramsMatch = equalForKeys(stateParams, inactiveState.locals.globals.$stateParams, state.ownParams);
        return paramsMatch ? inactiveState : null;
      }

      // Duplicates logic in $state.transitionTo, primarily to find the pivot state (i.e., the "keep" value)
      function equalForKeys(a, b, keys) {
        if (!keys) {
          keys = [];
          for (var n in a) keys.push(n); // Used instead of Object.keys() for IE8 compatibility
        }

        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          if (a[k] != b[k]) return false; // Not '===', values aren't necessarily normalized
        }
        return true;
      }

      var stickySupport = {
        getInactiveStates: function () {
          var states = [];
          angular.forEach(inactiveStates, function (state) {
            states.push(state);
          });
          return states;
        },
        getInactiveStatesByParent: function () {
          return mapInactives();
        },
        // Main API for $stickyState, used by $state.
        // Processes a potential transition, returns an object with the following attributes:
        // {
        //    inactives: Array of all states which will be inactive if the transition is completed. (both previously and newly inactivated)
        //    enter: Enter transition type for all added states.  This is a sticky array to "toStates" array in $state.transitionTo.
        //    exit: Exit transition type for all removed states.  This is a sticky array to "fromStates" array in $state.transitionTo.
        // }
        processTransition: function (transition) {
          // This object is returned
          var result = { inactives: [], enter: [], exit: [], keep: 0 };
          var fromPath = transition.fromState.path,
            fromParams = transition.fromParams,
            toPath = transition.toState.path,
            toParams = transition.toParams,
            options = transition.options;
          var keep = 0, state = toPath[keep];

          if (options.inherit) {
            toParams = inheritParams($stateParams, toParams || {}, $state.$current, transition.toState);
          }

          while (state && state === fromPath[keep] && equalForKeys(toParams, fromParams, state.ownParams)) {
            state = toPath[++keep];
          }

          result.keep = keep;

          var idx, deepestUpdatedParams, deepestReactivate, reactivatedStatesByName = {}, pType = getStickyTransitionType(fromPath, toPath, keep);
          var ancestorUpdated = false; // When ancestor params change, treat reactivation as exit/enter

          // Calculate the "enter" transitions for new states in toPath
          // Enter transitions will be either "enter", "reactivate", or "updateStateParams" where
          //   enter: full resolve, no special logic
          //   reactivate: use previous locals
          //   updateStateParams: like 'enter', except exit the inactive state before entering it.
          for (idx = keep; idx < toPath.length; idx++) {
            var enterTrans = !pType.to ? "enter" : getEnterTransition(toPath[idx], transition.toParams, ancestorUpdated);
            ancestorUpdated = (ancestorUpdated || enterTrans == 'updateStateParams');
            result.enter[idx] = enterTrans;
            // If we're reactivating a state, make a note of it, so we can remove that state from the "inactive" list
            if (enterTrans == 'reactivate')
              deepestReactivate = reactivatedStatesByName[toPath[idx].name] = toPath[idx];
            if (enterTrans == 'updateStateParams')
              deepestUpdatedParams = toPath[idx];
          }
          deepestReactivate = deepestReactivate ? deepestReactivate.self.name + "." : "";
          deepestUpdatedParams = deepestUpdatedParams ? deepestUpdatedParams.self.name + "." : "";

          // Inactive states, before the transition is processed, mapped to the parent to the sticky state.
          var inactivesByParent = mapInactives();

          // root ("") is always kept. Find the remaining names of the kept path.
          var keptStateNames = [""].concat(map(fromPath.slice(0, keep), function (state) {
            return state.self.name;
          }));

          // Locate currently and newly inactive states (at pivot and above) and store them in the output array 'inactives'.
          angular.forEach(keptStateNames, function (name) {
            var inactiveChildren = inactivesByParent[name];
            for (var i = 0; inactiveChildren && i < inactiveChildren.length; i++) {
              var child = inactiveChildren[i];
              // Don't organize state as inactive if we're about to reactivate it.
              if (!reactivatedStatesByName[child.name] &&
                (!deepestReactivate || (child.self.name.indexOf(deepestReactivate) !== 0)) &&
                (!deepestUpdatedParams || (child.self.name.indexOf(deepestUpdatedParams) !== 0)))
                result.inactives.push(child);
            }
          });

          // Calculate the "exit" transition for states not kept, in fromPath.
          // Exit transition can be one of:
          //   exit: standard state exit logic
          //   inactivate: register state as an inactive state
          for (idx = keep; idx < fromPath.length; idx++) {
            var exitTrans = "exit";
            if (pType.from) {
              // State is being inactivated, note this in result.inactives array
              result.inactives.push(fromPath[idx]);
              exitTrans = "inactivate";
            }
            result.exit[idx] = exitTrans;
          }

          return result;
        },

        // Adds a state to the inactivated sticky state registry.
        stateInactivated: function (state) {
          // Keep locals around.
          inactiveStates[state.self.name] = state;
          // Notify states they are being Inactivated (i.e., a different
          // sticky state tree is now active).
          state.self.status = 'inactive';
          if (state.self.onInactivate)
            $injector.invoke(state.self.onInactivate, state.self, state.locals.globals);
        },

        // Removes a previously inactivated state from the inactive sticky state registry
        stateReactivated: function (state) {
          if (inactiveStates[state.self.name]) {
            delete inactiveStates[state.self.name];
          }
          state.self.status = 'entered';
//        if (state.locals == null || state.locals.globals == null) debugger;
          if (state.self.onReactivate)
            $injector.invoke(state.self.onReactivate, state.self, state.locals.globals);
        },

        // Exits all inactivated descendant substates when the ancestor state is exited.
        // When transitionTo is exiting a state, this function is called with the state being exited.  It checks the
        // registry of inactivated states for descendants of the exited state and also exits those descendants.  It then
        // removes the locals and de-registers the state from the inactivated registry.
        stateExiting: function (exiting, exitQueue, onExit) {
          var exitingNames = {};
          angular.forEach(exitQueue, function (state) {
            exitingNames[state.self.name] = true;
          });

          angular.forEach(inactiveStates, function (inactiveExiting, name) {
            // TODO: Might need to run the inactivations in the proper depth-first order?
            if (!exitingNames[name] && inactiveExiting.includes[exiting.name]) {
              if (DEBUG) $log.debug("Exiting " + name + " because it's a substate of " + exiting.name + " and wasn't found in ", exitingNames);
              if (inactiveExiting.self.onExit)
                $injector.invoke(inactiveExiting.self.onExit, inactiveExiting.self, inactiveExiting.locals.globals);
              angular.forEach(inactiveExiting.locals, function(localval, key) {
                delete inactivePseudoState.locals[key];
              });
              inactiveExiting.locals = null;
              inactiveExiting.self.status = 'exited';
              delete inactiveStates[name];
            }
          });

          if (onExit)
            $injector.invoke(onExit, exiting.self, exiting.locals.globals);
          exiting.locals = null;
          exiting.self.status = 'exited';
          delete inactiveStates[exiting.self.name];
        },

        // Removes a previously inactivated state from the inactive sticky state registry
        stateEntering: function (entering, params, onEnter) {
          var inactivatedState = getInactivatedState(entering);
          if (inactivatedState && !getInactivatedState(entering, params)) {
            var savedLocals = entering.locals;
            this.stateExiting(inactivatedState);
            entering.locals = savedLocals;
          }
          entering.self.status = 'entered';

          if (onEnter)
            $injector.invoke(onEnter, entering.self, entering.locals.globals);
        },
        reset: function reset(inactiveState, params) {
          var state = $state.get(inactiveState);
          var exiting = getInactivatedState(state, params);
          if (!exiting) return false;
          stickySupport.stateExiting(exiting);
          $rootScope.$broadcast("$viewContentLoading");
          return true;
        }
      };

      return stickySupport;
    }];
}

angular.module("ct.ui.router.extras").provider("$stickyState", $StickyStateProvider);

/**
 * Sticky States makes entire state trees "sticky". Sticky state trees are retained until their parent state is
 * exited. This can be useful to allow multiple modules, peers to each other, each module having its own independent
 * state tree.  The peer modules can be activated and inactivated without any loss of their internal context, including
 * DOM content such as unvalidated/partially filled in forms, and even scroll position.
 *
 * DOM content is retained by declaring a named ui-view in the parent state, and filling it in with a named view from the
 * sticky state.
 *
 * Technical overview:
 *
 * ---PATHS---
 * UI-Router uses state paths to manage entering and exiting of individual states.  Each state "A.B.C.X" has its own path, starting
 * from the root state ("") and ending at the state "X".  The path is composed the final state "X"'s ancestors, e.g.,
 * [ "", "A", "B", "C", "X" ].
 *
 * When a transition is processed, the previous path (fromState.path) is compared with the requested destination path
 * (toState.path).  All states that the from and to paths have in common are "kept" during the transition.  The last
 * "kept" element in the path is the "pivot".
 *
 * ---VIEWS---
 * A View in UI-Router consists of a controller and a template.  Each view belongs to one state, and a state can have many
 * views.  Each view plugs into a ui-view element in the DOM of one of the parent state's view(s).
 *
 * View context is managed in UI-Router using a 'state locals' concept. When a state's views are fully loaded, those views
 * are placed on the states 'locals' object.  Each locals object prototypally inherits from its parent state's locals object.
 * This means that state "A.B.C.X"'s locals object also has all of state "A.B.C"'s locals as well as those from "A.B" and "A".
 * The root state ("") defines no views, but it is included in the protypal inheritance chain.
 *
 * The locals object is used by the ui-view directive to load the template, render the content, create the child scope,
 * initialize the controller, etc.  The ui-view directives caches the locals in a closure variable.  If the locals are
 * identical (===), then the ui-view directive exits early, and does no rendering.
 *
 * In stock UI-Router, when a state is exited, that state's locals object is deleted and those views are cleaned up by
 * the ui-view directive shortly.
 *
 * ---Sticky States---
 * UI-Router Extras keeps views for inactive states live, even when UI-Router thinks it has exited them.  It does this
 * by creating a pseudo state called "__inactives" that is the parent of the root state.  It also then defines a locals
 * object on the "__inactives" state, which the root state protoypally inherits from.  By doing this, views for inactive
 * states are accessible through locals object's protoypal inheritance chain from any state in the system.
 *
 * ---Transitions---
 * UI-Router Extras decorates the $state.transitionTo function.  While a transition is in progress, the toState and
 * fromState internal state representations are modified in order to coerce stock UI-Router's transitionTo() into performing
 * the appropriate operations.  When the transition promise is completed, the original toState and fromState values are
 * restored.
 *
 * Stock UI-Router's $state.transitionTo function uses toState.path and fromState.path to manage entering and exiting
 * states.  UI-Router Extras takes advantage of those internal implementation details and prepares a toState.path and
 * fromState.path which coerces UI-Router into entering and exiting the correct states, or more importantly, not entering
 * and not exiting inactive or sticky states.  It also replaces state.self.onEnter and state.self.onExit for elements in
 * the paths when they are being inactivated or reactivated.
 */



// ------------------------ Sticky State module-level variables -----------------------------------------------
var _StickyState; // internal reference to $stickyStateProvider
var internalStates = {}; // Map { statename -> InternalStateObj } holds internal representation of all states
var root, // Root state, internal representation
  pendingTransitions = [], // One transition may supersede another.  This holds references to all pending transitions
  pendingRestore, // The restore function from the superseded transition
  inactivePseudoState, // This pseudo state holds all the inactive states' locals (resolved state data, such as views etc)
  versionHeuristics = { // Heuristics used to guess the current UI-Router Version
    hasParamSet: false
  };

// Creates a blank surrogate state
function SurrogateState(type) {
  return {
    resolve: { },
    locals: {
      globals: root && root.locals && root.locals.globals
    },
    views: { },
    self: { },
    params: { },
    ownParams: ( versionHeuristics.hasParamSet ? { $$equals: function() { return true; } } : []),
    surrogateType: type
  };
}

// ------------------------ Sticky State registration and initialization code ----------------------------------
// Grab a copy of the $stickyState service for use by the transition management code
angular.module("ct.ui.router.extras").run(["$stickyState", function ($stickyState) {
  _StickyState = $stickyState;
}]);

angular.module("ct.ui.router.extras").config(
  [ "$provide", "$stateProvider", '$stickyStateProvider', '$urlMatcherFactoryProvider',
    function ($provide, $stateProvider, $stickyStateProvider, $urlMatcherFactoryProvider) {
      versionHeuristics.hasParamSet = !!$urlMatcherFactoryProvider.ParamSet;
      // inactivePseudoState (__inactives) holds all the inactive locals which includes resolved states data, i.e., views, scope, etc
      inactivePseudoState = angular.extend(new SurrogateState("__inactives"), { self: {  name: '__inactives'  } });
      // Reset other module scoped variables.  This is to primarily to flush any previous state during karma runs.
      root = pendingRestore = undefined;
      pendingTransitions = [];

      // Decorate any state attribute in order to get access to the internal state representation.
      $stateProvider.decorator('parent', function (state, parentFn) {
        // Capture each internal UI-Router state representations as opposed to the user-defined state object.
        // The internal state is, e.g., the state returned by $state.$current as opposed to $state.current
        internalStates[state.self.name] = state;
        // Add an accessor for the internal state from the user defined state
        state.self.$$state = function () {
          return internalStates[state.self.name];
        };

        // Register the ones marked as "sticky"
        if (state.self.sticky === true) {
          $stickyStateProvider.registerStickyState(state.self);
        }

        return parentFn(state);
      });

      var $state_transitionTo; // internal reference to the real $state.transitionTo function
      // Decorate the $state service, so we can decorate the $state.transitionTo() function with sticky state stuff.
      $provide.decorator("$state", ['$delegate', '$log', '$q', function ($state, $log, $q) {
        // Note: this code gets run only on the first state that is decorated
        root = $state.$current;
        internalStates[""] = root;
        root.parent = inactivePseudoState; // Make inactivePsuedoState the parent of root.  "wat"
        inactivePseudoState.parent = undefined; // Make inactivePsuedoState the real root.
        root.locals = inherit(inactivePseudoState.locals, root.locals); // make root locals extend the __inactives locals.
        delete inactivePseudoState.locals.globals;

        // Hold on to the real $state.transitionTo in a module-scope variable.
        $state_transitionTo = $state.transitionTo;

        // ------------------------ Decorated transitionTo implementation begins here ---------------------------
        $state.transitionTo = function (to, toParams, options) {
          // TODO: Move this to module.run?
          // TODO: I'd rather have root.locals prototypally inherit from inactivePseudoState.locals
          // Link root.locals and inactives.locals.  Do this at runtime, after root.locals has been set.
          if (!inactivePseudoState.locals)
            inactivePseudoState.locals = root.locals;
          var idx = pendingTransitions.length;
          if (pendingRestore) {
            pendingRestore();
            if (DEBUG) {
              $log.debug("Restored paths from pending transition");
            }
          }

          var fromState = $state.$current, fromParams = $state.params;
          var rel = options && options.relative || $state.$current; // Not sure if/when $state.$current is appropriate here.
          var toStateSelf = $state.get(to, rel); // exposes findState relative path functionality, returns state.self
          var savedToStatePath, savedFromStatePath, stickyTransitions;
          var reactivated = [], exited = [], terminalReactivatedState;

          var noop = function () {
          };
          // Sticky states works by modifying the internal state objects of toState and fromState, especially their .path(s).
          // The restore() function is a closure scoped function that restores those states' definitions to their original values.
          var restore = function () {
            if (savedToStatePath) {
              toState.path = savedToStatePath;
              savedToStatePath = null;
            }

            if (savedFromStatePath) {
              fromState.path = savedFromStatePath;
              savedFromStatePath = null;
            }

            angular.forEach(restore.restoreFunctions, function (restoreFunction) {
              restoreFunction();
            });
            // Restore is done, now set the restore function to noop in case it gets called again.
            restore = noop;
            // pendingRestore keeps track of a transition that is in progress.  It allows the decorated transitionTo
            // method to be re-entrant (for example, when superceding a transition, i.e., redirect).  The decorated
            // transitionTo checks right away if there is a pending transition in progress and restores the paths
            // if so using pendingRestore.
            pendingRestore = null;
            pendingTransitions.splice(idx, 1); // Remove this transition from the list
          };

          // All decorated transitions have their toState.path and fromState.path replaced.  Surrogate states also make
          // additional changes to the states definition before handing the transition off to UI-Router. In particular,
          // certain types of surrogate states modify the state.self object's onEnter or onExit callbacks.
          // Those surrogate states must then register additional restore steps using restore.addRestoreFunction(fn)
          restore.restoreFunctions = [];
          restore.addRestoreFunction = function addRestoreFunction(fn) {
            this.restoreFunctions.push(fn);
          };


          // --------------------- Surrogate State Functions ------------------------
          // During a transition, the .path arrays in toState and fromState are replaced.  Individual path elements
          // (states) which aren't being "kept" are replaced with surrogate elements (states).  This section of the code
          // has factory functions for all the different types of surrogate states.


          function stateReactivatedSurrogatePhase1(state) {
            var surrogate = angular.extend(new SurrogateState("reactivate_phase1"), { locals: state.locals });
            surrogate.self = angular.extend({}, state.self);
            return surrogate;
          }

          function stateReactivatedSurrogatePhase2(state) {
            var surrogate = angular.extend(new SurrogateState("reactivate_phase2"), state);
            var oldOnEnter = surrogate.self.onEnter;
            surrogate.resolve = {}; // Don't re-resolve when reactivating states (fixes issue #22)
            // TODO: Not 100% sure if this is necessary.  I think resolveState will load the views if I don't do this.
            surrogate.views = {}; // Don't re-activate controllers when reactivating states (fixes issue #22)
            surrogate.self.onEnter = function () {
              // ui-router sets locals on the surrogate to a blank locals (because we gave it nothing to resolve)
              // Re-set it back to the already loaded state.locals here.
              surrogate.locals = state.locals;
              _StickyState.stateReactivated(state);
            };
            restore.addRestoreFunction(function () {
              state.self.onEnter = oldOnEnter;
            });
            return surrogate;
          }

          function stateInactivatedSurrogate(state) {
            var surrogate = new SurrogateState("inactivate");
            surrogate.self = state.self;
            var oldOnExit = state.self.onExit;
            surrogate.self.onExit = function () {
              _StickyState.stateInactivated(state);
            };
            restore.addRestoreFunction(function () {
              state.self.onExit = oldOnExit;
            });
            return surrogate;
          }

          function stateEnteredSurrogate(state, toParams) {
            var oldOnEnter = state.self.onEnter;
            state.self.onEnter = function () {
              _StickyState.stateEntering(state, toParams, oldOnEnter);
            };
            restore.addRestoreFunction(function () {
              state.self.onEnter = oldOnEnter;
            });

            return state;
          }

          function stateExitedSurrogate(state) {
            var oldOnExit = state.self.onExit;
            state.self.onExit = function () {
              _StickyState.stateExiting(state, exited, oldOnExit);
            };
            restore.addRestoreFunction(function () {
              state.self.onExit = oldOnExit;
            });

            return state;
          }


          // --------------------- decorated .transitionTo() logic starts here ------------------------
          if (toStateSelf) {
            var toState = internalStates[toStateSelf.name]; // have the state, now grab the internal state representation
            if (toState) {
              // Save the toState and fromState paths to be restored using restore()
              savedToStatePath = toState.path;
              savedFromStatePath = fromState.path;

              var currentTransition = {toState: toState, toParams: toParams || {}, fromState: fromState, fromParams: fromParams || {}, options: options};

              pendingTransitions.push(currentTransition); // TODO: See if a list of pending transitions is necessary.
              pendingRestore = restore;

              // $StickyStateProvider.processTransition analyzes the states involved in the pending transition.  It
              // returns an object that tells us:
              // 1) if we're involved in a sticky-type transition
              // 2) what types of exit transitions will occur for each "exited" path element
              // 3) what types of enter transitions will occur for each "entered" path element
              // 4) which states will be inactive if the transition succeeds.
              stickyTransitions = _StickyState.processTransition(currentTransition);

              if (DEBUG) debugTransition($log, currentTransition, stickyTransitions);

              // Begin processing of surrogate to and from paths.
              var surrogateToPath = toState.path.slice(0, stickyTransitions.keep);
              var surrogateFromPath = fromState.path.slice(0, stickyTransitions.keep);

              // Clear out and reload inactivePseudoState.locals each time transitionTo is called
              angular.forEach(inactivePseudoState.locals, function (local, name) {
                if (name.indexOf("@") != -1) delete inactivePseudoState.locals[name];
              });

              // Find all states that will be inactive once the transition succeeds.  For each of those states,
              // place its view-locals on the __inactives pseudostate's .locals.  This allows the ui-view directive
              // to access them and render the inactive views.
              for (var i = 0; i < stickyTransitions.inactives.length; i++) {
                var iLocals = stickyTransitions.inactives[i].locals;
                angular.forEach(iLocals, function (view, name) {
                  if (iLocals.hasOwnProperty(name) && name.indexOf("@") != -1) { // Only grab this state's "view" locals
                    inactivePseudoState.locals[name] = view; // Add all inactive views not already included.
                  }
                });
              }

              // Find all the states the transition will be entering.  For each entered state, check entered-state-transition-type
              // Depending on the entered-state transition type, place the proper surrogate state on the surrogate toPath.
              angular.forEach(stickyTransitions.enter, function (value, idx) {
                var surrogate;
                if (value === "reactivate") {
                  // Reactivated states require TWO surrogates.  The "phase 1 reactivated surrogates" are added to both
                  // to.path and from.path, and as such, are considered to be "kept" by UI-Router.
                  // This is required to get UI-Router to add the surrogate locals to the protoypal locals object
                  surrogate = stateReactivatedSurrogatePhase1(toState.path[idx]);
                  surrogateToPath.push(surrogate);
                  surrogateFromPath.push(surrogate);  // so toPath[i] === fromPath[i]

                  // The "phase 2 reactivated surrogate" is added to the END of the .path, after all the phase 1
                  // surrogates have been added.
                  reactivated.push(stateReactivatedSurrogatePhase2(toState.path[idx]));
                  terminalReactivatedState = surrogate;
                } else if (value === "updateStateParams") {
                  // If the state params have been changed, we need to exit any inactive states and re-enter them.
                  surrogate = stateEnteredSurrogate(toState.path[idx]);
                  surrogateToPath.push(surrogate);
                  terminalReactivatedState = surrogate;
                } else if (value === "enter") {
                  // Standard enter transition.  We still wrap it in a surrogate.
                  surrogateToPath.push(stateEnteredSurrogate(toState.path[idx]));
                }
              });

              // Find all the states the transition will be exiting.  For each exited state, check the exited-state-transition-type.
              // Depending on the exited-state transition type, place a surrogate state on the surrogate fromPath.
              angular.forEach(stickyTransitions.exit, function (value, idx) {
                var exiting = fromState.path[idx];
                if (value === "inactivate") {
                  surrogateFromPath.push(stateInactivatedSurrogate(exiting));
                  exited.push(exiting);
                } else if (value === "exit") {
                  surrogateFromPath.push(stateExitedSurrogate(exiting));
                  exited.push(exiting);
                }
              });

              // Add surrogate for reactivated to ToPath again, this time without a matching FromPath entry
              // This is to get ui-router to call the surrogate's onEnter callback.
              if (reactivated.length) {
                angular.forEach(reactivated, function (surrogate) {
                  surrogateToPath.push(surrogate);
                });
              }

              // In some cases, we may be some state, but not its children states.  If that's the case, we have to
              // exit all the children of the deepest reactivated state.
              if (terminalReactivatedState) {
                var prefix = terminalReactivatedState.self.name + ".";
                var inactiveStates = _StickyState.getInactiveStates();
                var inactiveOrphans = [];
                inactiveStates.forEach(function (exiting) {
                  if (exiting.self.name.indexOf(prefix) === 0) {
                    inactiveOrphans.push(exiting);
                  }
                });
                inactiveOrphans.sort();
                inactiveOrphans.reverse();
                // Add surrogate exited states for all orphaned descendants of the Deepest Reactivated State
                surrogateFromPath = surrogateFromPath.concat(map(inactiveOrphans, function (exiting) {
                  return stateExitedSurrogate(exiting);
                }));
                exited = exited.concat(inactiveOrphans);
              }

              // Replace the .path variables.  toState.path and fromState.path are now ready for a sticky transition.
              toState.path = surrogateToPath;
              fromState.path = surrogateFromPath;

              var pathMessage = function (state) {
                return (state.surrogateType ? state.surrogateType + ":" : "") + state.self.name;
              };
              if (DEBUG) $log.debug("SurrogateFromPath: ", map(surrogateFromPath, pathMessage));
              if (DEBUG) $log.debug("SurrogateToPath:   ", map(surrogateToPath, pathMessage));
            }
          }

          // toState and fromState are all set up; now run stock UI-Router's $state.transitionTo().
          var transitionPromise = $state_transitionTo.apply($state, arguments);

          // Add post-transition promise handlers, then return the promise to the original caller.
          return transitionPromise.then(function transitionSuccess(state) {
            // First, restore toState and fromState to their original values.
            restore();
            if (DEBUG)  debugViewsAfterSuccess($log, internalStates[state.name], $state);

            state.status = 'active';  // TODO: This status is used in statevis.js, and almost certainly belongs elsewhere.

            return state;
          }, function transitionFailed(err) {
            restore();
            if (DEBUG &&
              err.message !== "transition prevented" &&
              err.message !== "transition aborted" &&
              err.message !== "transition superseded") {
              $log.debug("transition failed", err);
              console.log(err.stack);
            }
            return $q.reject(err);
          });
        };
        return $state;
      }]);
    }
  ]
);

function debugTransition($log, currentTransition, stickyTransition) {
  function message(path, index, state) {
    return (path[index] ? path[index].toUpperCase() + ": " + state.self.name : "(" + state.self.name + ")");
  }

  var inactiveLogVar = map(stickyTransition.inactives, function (state) {
    return state.self.name;
  });
  var enterLogVar = map(currentTransition.toState.path, function (state, index) {
    return message(stickyTransition.enter, index, state);
  });
  var exitLogVar = map(currentTransition.fromState.path, function (state, index) {
    return message(stickyTransition.exit, index, state);
  });

  var transitionMessage = currentTransition.fromState.self.name + ": " +
    angular.toJson(currentTransition.fromParams) + ": " +
    " -> " +
    currentTransition.toState.self.name + ": " +
    angular.toJson(currentTransition.toParams);

  $log.debug("   Current transition: ", transitionMessage);
  $log.debug("Before transition, inactives are:   : ", map(_StickyState.getInactiveStates(), function (s) {
    return s.self.name;
  }));
  $log.debug("After transition,  inactives will be: ", inactiveLogVar);
  $log.debug("Transition will exit:  ", exitLogVar);
  $log.debug("Transition will enter: ", enterLogVar);
}

function debugViewsAfterSuccess($log, currentState, $state) {
  $log.debug("Current state: " + currentState.self.name + ", inactive states: ", map(_StickyState.getInactiveStates(), function (s) {
    return s.self.name;
  }));

  var viewMsg = function (local, name) {
    return "'" + name + "' (" + local.$$state.name + ")";
  };
  var statesOnly = function (local, name) {
    return name != 'globals' && name != 'resolve';
  };
  var viewsForState = function (state) {
    var views = map(filterObj(state.locals, statesOnly), viewMsg).join(", ");
    return "(" + (state.self.name ? state.self.name : "root") + ".locals" + (views.length ? ": " + views : "") + ")";
  };

  var message = viewsForState(currentState);
  var parent = currentState.parent;
  while (parent && parent !== currentState) {
    if (parent.self.name === "") {
      // Show the __inactives before showing root state.
      message = viewsForState($state.$current.path[0]) + " / " + message;
    }
    message = viewsForState(parent) + " / " + message;
    currentState = parent;
    parent = currentState.parent;
  }

  $log.debug("Views: " + message);
}


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
        } else if (parentName === "") {
          parentMatcher = $urlMatcherFactory.compile("");
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

angular.module('ct.ui.router.extras').service("$previousState",
  [ '$rootScope', '$state',
    function ($rootScope, $state) {
      var previous = null;
      var memos = {};

      var lastPrevious = null;

      $rootScope.$on("$stateChangeStart", function (evt, toState, toStateParams, fromState, fromStateParams) {
        // State change is starting.  Keep track of the CURRENT previous state in case we have to restore it
        lastPrevious = previous;
        previous = { state: fromState, params: fromStateParams };
      });

      $rootScope.$on("$stateChangeError", function () {
        // State change did not occur due to an error.  Restore the previous previous state.
        previous = lastPrevious;
        lastPrevious = null;
      });

      $rootScope.$on("$stateChangeSuccess", function () {
        lastPrevious = null;
      });

      var $previousState = {
        get: function (memoName) {
          return memoName ? memos[memoName] : previous;
        },
        go: function (memoName, options) {
          var to = $previousState.get(memoName);
          return $state.go(to.state, to.params, options);
        },
        memo: function (memoName, defaultStateName, defaultStateParams) {
          memos[memoName] = previous || { state: $state.get(defaultStateName), params: defaultStateParams };
        },
        forget: function (memoName) {
          delete memos[memoName];
        }
      };

      return $previousState;
    }
  ]
);

angular.module('ct.ui.router.extras').run(['$previousState', function ($previousState) {
  // Inject $previousState so it can register $rootScope events
}]);


angular.module("ct.ui.router.extras").config( [ "$provide",  function ($provide) {
      // Decorate the $state service, so we can replace $state.transitionTo()
      $provide.decorator("$state", ['$delegate', '$rootScope', '$q', '$injector',
        function ($state, $rootScope, $q, $injector) {
          // Keep an internal reference to the real $state.transitionTo function
          var $state_transitionTo = $state.transitionTo;
          // $state.transitionTo can be re-entered.  Keep track of re-entrant stack
          var transitionDepth = -1;
          var tDataStack = [];
          var restoreFnStack = [];

          // This function decorates the $injector, adding { $transition$: tData } to invoke() and instantiate() locals.
          // It returns a function that restores $injector to its previous state.
          function decorateInjector(tData) {
            var oldinvoke = $injector.invoke;
            var oldinstantiate = $injector.instantiate;
            $injector.invoke = function (fn, self, locals) {
              return oldinvoke(fn, self, angular.extend({$transition$: tData}, locals));
            };
            $injector.instantiate = function (fn, locals) {
              return oldinstantiate(fn, angular.extend({$transition$: tData}, locals));
            };

            return function restoreItems() {
              $injector.invoke = oldinvoke;
              $injector.instantiate = oldinstantiate;
            };
          }

          function popStack() {
            restoreFnStack.pop()();
            tDataStack.pop();
            transitionDepth--;
          }

          // This promise callback (for when the real transitionTo is successful) runs the restore function for the
          // current stack level, then broadcasts the $transitionSuccess event.
          function transitionSuccess(deferred, tSuccess) {
            return function successFn(data) {
              popStack();
              $rootScope.$broadcast("$transitionSuccess", tSuccess);
              return deferred.resolve(data);
            };
          }

          // This promise callback (for when the real transitionTo fails) runs the restore function for the
          // current stack level, then broadcasts the $transitionError event.
          function transitionFailure(deferred, tFail) {
            return function failureFn(error) {
              popStack();
              $rootScope.$broadcast("$transitionError", tFail, error);
              return deferred.reject(error);
            };
          }

          // Decorate $state.transitionTo.
          $state.transitionTo = function (to, toParams, options) {
            // Create a deferred/promise which can be used earlier than UI-Router's transition promise.
            var deferred = $q.defer();
            // Place the promise in a transition data, and place it on the stack to be used in $stateChangeStart
            var tData = tDataStack[++transitionDepth] = {
              promise: deferred.promise
            };
            // placeholder restoreFn in case transitionTo doesn't reach $stateChangeStart (state not found, etc)
            restoreFnStack[transitionDepth] = function() { };
            // Invoke the real $state.transitionTo
            var tPromise = $state_transitionTo.apply($state, arguments);

            // insert our promise callbacks into the chain.
            return tPromise.then(transitionSuccess(deferred, tData), transitionFailure(deferred, tData));
          };

          // This event is handled synchronously in transitionTo call stack
          $rootScope.$on("$stateChangeStart", function (evt, toState, toParams, fromState, fromParams) {
              var depth = transitionDepth;
              // To/From is now normalized by ui-router.  Add this information to the transition data object.
              var tData = angular.extend(tDataStack[depth], {
                to: { state: toState, params: toParams },
                from: { state: fromState, params: fromParams }
              });

              var restoreFn = decorateInjector(tData);
              restoreFnStack[depth] = restoreFn;
              $rootScope.$broadcast("$transitionStart", tData);
            }
          );

          return $state;
        }]);
    }
  ]
);

})(window, window.angular);