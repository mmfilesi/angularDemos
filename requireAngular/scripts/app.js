/**
 * @ngdoc overview
 * @name demoRequire
 * @description
 * # demoRequire
 *
 * Definión del módulo (module) principal de la aplicación
 */

/* La estructura habitual de un módulo:
    angular
        .module('demoRequire', [
            'ui.bootstrap',
            'ngAnimate'
        ])
        .config(function ($routeProvider) {
    ....
La convertimos en un "módulo require" mediante el método define, el cual
recibe tres parámetros
    el nombre del modulo: opcional;
    el array de dependencias
    y una función que contiene el código del módulo.
*/

define([
    /*dependencias (re-definimos las rutas no declaradas antes) */
    'angular',
    'services/factory', 
    'services/utils'
    ],
    /* Función principal del módulo require, en el que inyectamos las dependencias
    anteriores */ 
    function (angular, Factory, Utils) {
        'use strict';

        /* Cacheamos el módulo angular en una variable que retornaremos
        al final */

        var demoRequire =  angular.module('demoRequire', [
            /* dependencias angular */
            'ngCookies',
            'ngResource',
            'ngSanitize',      
            'ngAnimate',
            'ngTouch',
            'ui.bootstrap',      
            'ng.httpLoader',
            'ngRoute',
            'ui.router',
            'ct.ui.router.extras'
        ])
        .config( function($stateProvider, $futureStateProvider) {

            /* En esta función armamos todo el sistema de promesas que
            pasaremos al stateFactory */

            /* Ver: http://christopherthielen.github.io/ui-router-extras/#/future

            When a transition is requested to a state that doesn't exists, $futureStatesProvider checks if the missing state maps to a FutureState, or any possible decendant of a FutureState.
            When it finds a placeholder that may map to the missing state, it pretends that the transition occurred successfully (according to the URL).
            It then begins the lazy loading of the full UI-Router state definition.
            When that promise resolves, it re-attempts the transition. */

            function requireCtrlStateFactory($q, futureState) {
                /* Hacemos la promesa */
                var d = $q.defer();

                require([futureState.controller], function (controller) {
                    var fullstate = { 
                        controller:     controller,
                        name:           futureState.name,
                        url:            futureState.url,
                        templateUrl:    futureState.templateUrl
                    };
    
                    if (futureState.urlParams) {
                        fullstate.url+='?' + futureState.urlParams;
                    }
     
                    if (futureState['abstract']) {
                        fullstate['abstract'] = futureState['abstract'];
                    }

                    /* Resolvemos la promesa */
                     d.resolve(fullstate);
                });
    
            /* Y la devolvemos */
            return d.promise;
            }

       	/* Vamos cargando los estados futuros en tiempo de ejecución */
    	$futureStateProvider.stateFactory('requireCtrl', requireCtrlStateFactory);
    	var loadAndRegisterFutureStates = function ($http) {
            /* Cargamos route-controller y por cada item definimos un estado futuro */
        	return $http.get('route-controllers.json').then(function (resp) {
        		angular.forEach(resp.data, function (fstate) {
        			fstate.type = 'requireCtrl';
        			$futureStateProvider.futureState(fstate);
        		});
        	});
        };

        $futureStateProvider.addResolve(loadAndRegisterFutureStates);
        
    })	
.run(function($timeout) {
	
});

return demoRequire;

});