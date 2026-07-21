//-------------------------------
//Devfolio Generator
//File Name : developer.js
//Author : Hiya Baishya
//Description : Stores developer information
//--------------------------------

//----------------------
//Variables
//----------------------

// const: value should never be change
const collegeName = "Handique Girls' College";
const course = "Bachelor Of Computer Application";
const country = "India";

//let: value can change
let developerName = "Harinakshi Baishya";
let age = "21";            // stored as string will convert later
let city = "Guwahati";
let state = "Assam";
let favouriteLanguage = "JavaScript";

//--------Primitive Datatypes-----------

//String
let email = "harinakshibaishya@gmail.com";
//Number
let experience = 1;
//Boolean
let isFresher = false;
//undefined
let currentCompany;
//null
let dreamCompany = null;
//symbol
const developerID = Symbol("DEV001");
//bigint
const phoneNumber = 8283955846678848888n;

//----------TYPEOF CHECK----------------

console.log("------DATATYPES------");

console.log("developerName :", typeof developerName);
console.log("age :", typeof age);
console.log("city :", typeof city);
console.log("state :", typeof state);
console.log("email :", typeof email);
console.log("experience :", typeof experience);
console.log("isFresher :",typeof isFresher);
console.log("currentcompany :",typeof currentcompany);
console.log("dreamcompany :",typeof dreamcompany);
console.log("developerID :",typeof developerID);
console.log("phoneNumber :",typeof phoneNumber);

//type conversion

console.log("\n---TYPE CONVERSION---");

console.log("before conversion:");
console.log(age);
console.log(typeof age);

age = Number(age);

console.log("\nAfter Conversion:");
console.log(age);
console.log(typeof age);


// =========== BOOLEAN CONVERSION


console.log("\n======== BOOLEAN CONVERSION ==========");

let githubLink = "";

console.log(Boolean(githubLink)); // false

githubLink = "github.com/harinakshi";

console.log(Boolean(githubLink)); // true


// =============TEMPLATE LITERALS

console.log("\n========== DEVELOPER INTRODUCTION ==========");

console.log(`
Hello!

My name is ${developerName}.

I am pursuing ${course} at ${collegeName}.

I live in ${city}, ${state}, ${country}.

Currently I am learning JavaScript.

My goal is to become a Software Developer.

Thank You!
`);


// =========================================
// FINAL SUMMARY
// =========================================

console.log("========== SUMMARY ==========");

console.log(`Developer Name : ${developerName}`);
console.log(`Age            : ${age}`);
console.log(`Course         : ${course}`);
console.log(`College        : ${collegeName}`);
console.log(`Location       : ${city}, ${state}`);
console.log(`Email          : ${email}`);
console.log(`Experience     : ${experience} Year`);
console.log(`Fresher        : ${isFresher}`);

console.log("==============================");
console.log("developer.js Executed Successfully ✅");
console.log("==============================");