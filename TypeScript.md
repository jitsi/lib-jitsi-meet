# TypeScript conversion

## the plan

Over time the plan is to convert most (if not all) of the project to TypeScript.

There are a number of reasons for doing this including improved maintainability (due to strong type checking) and easier usage (due to intellisense).

The aim at all times will be to ensure no breaking changes. This will be achieved by supporting the previous code style but enhancing it where possible.

The first step is to to identify and convert the enums so that they can then be used as type constrains in properties and method arguments.

The second step will be to introduce interfaces for the major components of the library which will then be populated as methods/properties need to be exposed to other areas of the system.

This will allow a gradual strong-typing of the code base without the need to convert the large core files e.g. JitsiConference early on.

It is likely that the third step will be to work through the unit tests and convert them to TypeScript - this will then make testing the converted code a bit easier.

The fourth step will be to work through the modules, ideally in order of age (oldest and therefore least likely to be updated first) so that likelihood of a clash with active development is reduced. If in doubt the JavaScript will be kept and the TypeScript conversion aborted when a merge conflict is found.

Finally, a number of the files are not ES6 modules and use some older techniques - these will be updated to either modern JavaScript or directly to TypeScript depending on which proves least risky.

It will be especially important to add unit tests during these conversion processes as we want as few conversion bugs as possible.

## conventions

eslint is currently configured to provide warnings around code style violations - this will remain as is and potentially augmented with further rules.

The current rules dictate 4-space indentation, LF line endings and limits for line length.

We will initially use TypeScript enums for groups of constants - we might change this plan in the future - especially if ES adopts an native enum. Importantly the TypeScript enum will help us write tighter code, and prompt our consumers to only use values that are correct.

During the early conversions there will be a number of places where we will have to use 'unknown' and 'object' for the types of properties and arguments. As more of the codebase is converted then it will be possible to update these constraints to more accurate types. We will use interfaces for the major components that get passed around until they are converted - e.g. JitsiConference / JitsiConnection
