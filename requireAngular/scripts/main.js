'use strict';
/**
 * @ngdoc overview
 * @name demoBarcelo
 * @description
 * # demoBarcelo
 *
 * Punto de entrada de la aplicación
 */

 /* Definimos las rutas que se corresponden a cada "alias" */ 
require.config({
    waitSeconds: 0,
    paths: {
        'angular':              '../bower_components/angular/angular',
        'angular-animate':      '../bower_components/angular-animate/angular-animate',
        'angular-cookies':      '../bower_components/angular-cookies/angular-cookies',
        'angular-mocks':        '../bower_components/angular-mocks/angular-mocks',
        'angular-resource':     '../bower_components/angular-resource/angular-resource',
        'angular-route':        '../bower_components/angular-route/angular-route',
        'angular-sanitize':     '../bower_components/angular-sanitize/angular-sanitize',
        'angular-scenario':     '../bower_components/angular-scenario/angular-scenario',
        'angular-touch':        '../bower_components/angular-touch/angular-touch',    
        'angular-bootstrap':    '../bower_components/angular-bootstrap/ui-bootstrap-tpls',
        'angular-http-loader':  '../bower_components/angular-http-loader/app/package/js/angular-http-loader.min',
        'angular-ui-router':    '../bower_components/angular-ui-router/release/angular-ui-router.min',
        'jquery':               '../bower_components/jquery/dist/jquery.min',
        'moment':               '../bower_components/moment/min/moment.min',
        'ui-router-extras':     '../bower_components/ui-router-extras/release/ct-ui-router-extras.min',
        'lodash':               '../bower_components/lodash/lodash.min'
    },
    /* Definimos las dependencias donde se necesitan */
    shim: {
        'moment':{
        	exports:'moment'
        },
        'angular': {
            exports: 'angular',
            deps: ['moment']
        },
        'angular-route': ['angular'],
        'angular-cookies': ['angular'],
        'angular-sanitize': ['angular'],
        'angular-resource': ['angular'],
        'angular-animate': ['angular'],
        'angular-touch': ['angular'],
        'angular-bootstrap': ['angular'],
        'angular-http-loader' :['angular'],
        'angular-ui-router': ['angular'],
        'ui-router-extras': ['angular'],
        'angular-mocks': {
            exports: 'angular.mock',
            deps: ['angular']            
        }
        
    },
    priority: ['angular']
});

/* Para que se carguen las dependencias sin volverse loco, ralentizamos
el proceso de inicialización de la aplicación.
ver: https://docs.angularjs.org/guide/bootstrap */
window.name = 'NG_DEFER_BOOTSTRAP!';

 /* "Requerimos" los archivos definidos antes por su alias */
require([
    'angular',
    'app',
    'angular-route',
    'angular-cookies',
    'angular-sanitize',
    'angular-resource',
    'angular-animate',
    'angular-touch',
    'angular-bootstrap',
    'angular-http-loader',
    'angular-ui-router',
    'jquery',
    'moment',
    'ui-router-extras',
    'lodash'
  ], function(angular, app) {
    /* Inicializamos manualmente la aplicación (vd. supra)   */ 
        angular.element(document).ready(function() {
            angular.bootstrap(document, ['demoBarcelo']);   
        });
});
