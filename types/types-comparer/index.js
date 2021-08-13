"use strict";

// code based upon https://github.com/microsoft/TypeScript-wiki/blob/master/Using-the-Compiler-API.md 
// and modified to output class and member declarations for use by a diff tool

const ts = require( 'typescript' );
const glob = require( 'glob' );
const fs = require( 'fs' );
const path = require( 'path' );

const args = process.argv.slice( 2 );
const dirname = args[ 0 ];
const outputFile = args.length > 1 ? args[ 1 ] : undefined;

const normalisedPathName = path.normalize( path.resolve( dirname ) ).replace( /\\/g, "/" ) + '/';

const normaliseFilename = ( filename ) => {
    return filename.replace( new RegExp( normalisedPathName ), '' );
};

glob( normalisedPathName + "**/*.d.ts", null, ( error, files ) => {
    const program = ts.createProgram( files, { maxNodeModuleJsDepth: 10 } );
    const checker = program.getTypeChecker();

    let output = [];

    for ( const sourceFile of program.getSourceFiles() ) {
        const serializeSymbol = ( symbol ) => {
            if ( symbol.getName() === "default" ) {
                return {
                    name: checker.typeToString( checker.getTypeOfSymbolAtLocation( symbol, symbol.valueDeclaration ) ).substring( 7 )
                };
            } else {
                return {
                    name: symbol.getName()
                };
            }
        };

        const serializeModifierFlags = ( symbol ) => {
            const flags = ts.getCombinedModifierFlags( symbol );

            if ( flags === ts.ModifierFlags.None ) return "";
            if ( flags === ts.ModifierFlags.Export ) return "";

            //Export = 1,
            //Ambient = 2,
            //Public = 4,
            //Private = 8,
            //Protected = 16,
            //Static = 32,
            //Readonly = 64,
            //Abstract = 128,
            //Async = 256,
            //Default = 512,
            //Const = 2048,
            //HasComputedJSDocModifiers = 4096,
            //Deprecated = 8192,
            //HasComputedFlags = 536870912,
            //AccessibilityModifier = 28,
            //ParameterPropertyModifier = 92,
            //NonPublicAccessibilityModifier = 24,
            //TypeScriptModifier = 2270,
            //ExportDefault = 513,
            //All = 11263

            return `[${ flags }]`;
        };

        const normaliseImportedType = ( type ) => {
            if ( type.indexOf( 'typeof import(' ) >= 0 ) {
                type = normaliseFilename( type ).replace( /\"/g, "'" );
            }

            return type;
        };

        const serializeMember = ( symbol ) => `${ serializeModifierFlags( symbol ) }${ symbol.getName() }: ${ normaliseImportedType( checker.typeToString( checker.getTypeOfSymbolAtLocation( symbol, symbol.valueDeclaration ) ) ) }`;

        const serializeSignature = ( signature ) => signature.parameters.map( symbol => serializeMember( symbol ) ).join( ", " );

        const serializeClass = ( symbol ) => {
            let details = serializeSymbol( symbol );

            // Get the construct signatures
            let constructorType = checker.getTypeOfSymbolAtLocation( symbol, symbol.valueDeclaration );
            details.constructors = constructorType
                .getConstructSignatures()
                .map( serializeSignature );

            const memberCount = symbol.members.size;
            if ( memberCount > 0 ) {
                details.members = [];
                for ( const kp of symbol.members ) {
                    const memberKey = kp[ 0 ];
                    if ( memberKey.startsWith( '_' ) ) continue; // ignore private members
                    const memberValue = kp[ 1 ];
                    details.members.push( serializeMember( memberValue ) );
                }
                details.members.sort();
            }

            return details;
        };

        const isNodeExported = ( node ) => ( ts.getCombinedModifierFlags( node ) & ts.ModifierFlags.Export ) !== 0 || ( !!node.parent && node.parent.kind === ts.SyntaxKind.SourceFile );

        const visit = ( node ) => {
            // Only consider exported nodes
            if ( !isNodeExported( node ) ) {
                return;
            }

            if ( ts.isClassDeclaration( node ) && node.name ) {
                // This is a top level class, get its symbol
                let symbol = checker.getSymbolAtLocation( node.name );
                if ( symbol ) {
                    const definition = serializeClass( symbol );
                    output.push( { fileName: normaliseFilename( sourceFile.fileName ), ...definition } );
                }
            } else if ( ts.isModuleDeclaration( node ) ) {
                // This is a namespace, visit its children
                ts.forEachChild( node, visit );
            }
        };

        ts.forEachChild( sourceFile, visit );
    }

    output = output.filter( m => m.fileName.indexOf( "node_modules/" ) < 0 );

    output.sort( ( a, b ) => {
        if ( a.name < b.name ) return -1;
        if ( a.name > b.name ) return 1;
        return 0;
    } );

    if ( outputFile ) {
        fs.writeFileSync( outputFile, JSON.stringify( output, null, 2 ) );
    } else {
        console.log( JSON.stringify( output, null, 2 ) );
    }
} );

