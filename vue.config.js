'use strict';

module.exports = {

//   NODE_ENV: '"production"',

  publicPath: // '/pacman/'
   process.env.NODE_ENV === 'production'
     ? "/pacman/" : ""
};