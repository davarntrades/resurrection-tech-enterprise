"use strict";

const governed = require("./customer-support-governed-workflow");
const dashboard = require("./customer-support-dashboard");

module.exports = { ...governed, dashboard };