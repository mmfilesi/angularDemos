/* Convertimos el controlador en un módulo AMD */

/*define('myModule', 
    ['foo', 'bar'], 
    // module definition function
    // dependencies (foo and bar) are mapped to function parameters
    function ( foo, bar ) {
        // return a value that defines the module export
        // (i.e the functionality we want to expose for consumption)
    
        // create your module here
        var myModule = {
            doStuff:function(){
                console.log('Yay! Stuff');
            }
        }
 
        return myModule;
}); */


define(['angular'], function (angular) {
'use strict';
 return function ($scope) {
 	console.log("Controlador Main");

 } /* #función */
}); /* #módulo */