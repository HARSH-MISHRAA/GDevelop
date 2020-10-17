/**
 * This uses the IDL definitions (Bindings.idl),
 * to generate types that can be consumed in the IDE codebase.
 *
 * Bindings.idl is also used by Emscripten
 * to generate the JS interface to the WebAssembly compiled C++ code of GDCore/GDJS/GDCpp.
 * The parsers and code generation have a few hacks (see postjs.js), so
 * we need to also do some hacks/manipulation on the input and some resulting files.
 */
const shell = require('shelljs');
const path = require('path');
const fs = require('fs');

shell.cd(path.join(__dirname, '..'));
const idlTempFolder = fs.mkdtempSync('gdevelopjs-cleaned-bindings-idl');

// Remove some "extended attributes" from the webIDL definitions as they
// are not supported by the webidl2.js parser used by "webidl-tools".
shell.cp('-f', 'Bindings/Bindings.idl', idlTempFolder);
const idlFile = path.join(idlTempFolder, 'Bindings.idl');
shell.sed('-i', /\[Prefix="sf::"\]/, '// Removed sf prefix', idlFile);
shell.sed('-i', /\[Prefix="gdjs::"\]/, '//Removed gdjs prefix', idlFile);
shell.sed(
  '-i',
  /\[Prefix="gd::InstructionMetadata::"\]/,
  '//Removed gd::InstructionMetadata prefix',
  idlFile
);

// Don't remove the "types" folder because then Flow
// is not loading the files. This means a removed class must
// have its typing file be removed manually.
// shell.rm('-rf', 'types/');

// Run "webidl-tools flow" that will take care of converting
// the webIDL declarations to Flow classes.
const webidlToolsFlowResult = shell.exec(
  `node node_modules/webidl-tools/bin/webidl-tools-flow --out types` +
    ` --module-name libGDevelop` +
    // Prefix all classes by "gd", to easily recognise them
    // in the IDE codebase:
    ` --prefix-interfaces gd` +
    // Add "delete" method (see postjs.js) and "ptr"
    // (as it's used in the codebase)
    ` --add-delete-operation` +
    ` --add-emscripten-ptr-attribute` +
    // Transform functions from UpperCamelCase to lowerCamelCase.
    ` --uncapitalize-operations` +
    // Static functions are prefixed
    ` --static-operation-prefix STATIC_` +
    // Functions starting by WRAPPED_, MAP_, FREE_ will be
    // stripped of their prefix (see postjs.js):
    ` --rename "s/WRAPPED_//" --rename "s/MAP_//"  --rename "s/FREE_//"` +
    // Functions starting by CLONE_ will be renamed to clone
    // (see postjs.js and update-bindings.js)
    ` --rename "s/CLONE_.*/clone/"` +
    ` ${idlFile}`,
  {},
  (code, stdout, stderr) => {
    fs.unlinkSync(idlFile);
    fs.rmdirSync(idlTempFolder);
    if (code !== 0 || stdout.length > 1000) {
      shell.echo(
        '❌ The output of "webidl-tools flow" is suspicously long or errored. Considering as an error.'
      );
      shell.echo(
        'ℹ️ Is Bindings.idl improperly formatted, or using a syntax not understood by "webidl-tools flow"?'
      );
      shell.exit(1);
    }

    fs.writeFileSync(
      'types/other-adhoc-types.js',
      `// Automatically generated by GDevelop.js/scripts/generate-types.js
declare type gdSerializable = any;
declare type gdEffectsContainer = gdLayer;
declare type gdEmscriptenObject = {
  ptr: number;
};
`
    );

    // Fix enums, that are numbers and can be accessed from their enclosing class.
    fs.writeFileSync(
      'types/eventsfunction_functiontype.js',
      `// Automatically generated by GDevelop.js/scripts/generate-types.js
type EventsFunction_FunctionType = 0 | 1 | 2 | 3`
    );
    shell.sed(
      '-i',
      'declare class gdEventsFunction {',
      [
        'declare class gdEventsFunction {',
        '  static Action: 0;',
        '  static Condition: 1;',
        '  static Expression: 2;',
        '  static StringExpression: 3;',
      ].join('\n'),
      'types/gdeventsfunction.js'
    );
    fs.writeFileSync(
      'types/expressioncompletiondescription_completionkind.js',
      `// Automatically generated by GDevelop.js/scripts/generate-types.js
type ExpressionCompletionDescription_CompletionKind = 0 | 1 | 2 | 3`
    );
    shell.sed(
      '-i',
      'declare class gdExpressionCompletionDescription {',
      [
        'declare class gdExpressionCompletionDescription {',
        '  static Object: 0;',
        '  static Behavior: 1;',
        '  static Expression: 2;',
        '  static Variable: 3;',
      ].join('\n'),
      'types/gdexpressioncompletiondescription.js'
    );
    fs.writeFileSync(
      'types/particleemitterobject_renderertype.js',
      `// Automatically generated by GDevelop.js/scripts/generate-types.js
type ParticleEmitterObject_RendererType = 0 | 1 | 2`
    );
    shell.sed(
      '-i',
      'declare class gdParticleEmitterObject {',
      [
        'declare class gdParticleEmitterObject {',
        '  static Point: 0;',
        '  static Line: 1;',
        '  static Quad: 2;',
      ].join('\n'),
      'types/gdparticleemitterobject.js'
    );

    // Add convenience methods that are manually added (see postjs.js):
    shell.sed(
      '-i',
      'declare class libGDevelop {',
      [
        'declare class libGDevelop {',
        '  getPointer(gdEmscriptenObject): number;',
        '  castObject<T>(gdEmscriptenObject, Class<T>): T;',
        '  compare(gdEmscriptenObject, gdEmscriptenObject): boolean;',
        '',
        '  getTypeOfObject(globalObjectsContainer: gdObjectsContainer, objectsContainer: gdObjectsContainer, objectName: string, searchInGroups: boolean): string;',
        '  getTypeOfBehavior(globalObjectsContainer: gdObjectsContainer, objectsContainer: gdObjectsContainer, objectName: string, searchInGroups: boolean): string;',
        '  getBehaviorsOfObject(globalObjectsContainer: gdObjectsContainer, objectsContainer: gdObjectsContainer, objectName: string, searchInGroups: boolean): gdVectorString;',
        '',
        '  removeFromVectorParameterMetadata(gdVectorParameterMetadata, index: number): void;',
        '',
        `  asStandardEvent(gdBaseEvent): gdStandardEvent;`,
        `  asRepeatEvent(gdBaseEvent): gdRepeatEvent;`,
        `  asWhileEvent(gdBaseEvent): gdWhileEvent;`,
        `  asForEachEvent(gdBaseEvent): gdForEachEvent;`,
        `  asCommentEvent(gdBaseEvent): gdCommentEvent;`,
        `  asGroupEvent(gdBaseEvent): gdGroupEvent;`,
        `  asLinkEvent(gdBaseEvent): gdLinkEvent;`,
        `  asJsCodeEvent(gdBaseEvent): gdJsCodeEvent;`,
        `  asPlatform(gdPlatform): gdPlatform;`,
        '',
        `  asSpriteObject(gdObject): gdSpriteObject;`,
        `  asTiledSpriteObject(gdObject): gdTiledSpriteObject;`,
        `  asPanelSpriteObject(gdObject): gdPanelSpriteObject;`,
        `  asTextObject(gdObject): gdTextObject;`,
        `  asShapePainterObject(gdObject): gdShapePainterObject;`,
        `  asAdMobObject(gdObject): gdAdMobObject;`,
        `  asTextEntryObject(gdObject): gdTextEntryObject;`,
        `  asParticleEmitterObject(gdObject): gdParticleEmitterObject;`,
        `  asObjectJsImplementation(gdObject): gdObjectJsImplementation;`,
        '',
        `  asImageResource(gdResource): gdImageResource;`,
        '',
      ].join('\n'),
      'types/libgdevelop.js'
    );
    shell.sed(
      '-i',
      'declare class gdVectorString {',
      'declare class gdVectorString {\n  toJSArray(): Array<string>;',
      'types/gdvectorstring.js'
    );
    shell.sed(
      '-i',
      'declare class gdSerializer {',
      'declare class gdSerializer {\n  static fromJSObject(object: Object): gdSerializerElement;',
      'types/gdserializer.js'
    );
    shell.sed(
      '-i',
      'declare class gdInstructionsList {',
      'declare class gdInstructionsList {\n  push_back(gdInstruction): void;',
      'types/gdinstructionslist.js'
    );

    // Add inheritance not expressed in Bindings.idl.
    // TODO: these should be expressed in Bindings.idl using "implements".
    shell.sed(
      '-i',
      'declare class gdProject {',
      'declare class gdProject extends gdObjectsContainer {',
      'types/gdproject.js'
    );
    shell.sed(
      '-i',
      'declare class gdLayout {',
      'declare class gdLayout extends gdObjectsContainer {',
      'types/gdlayout.js'
    );
    shell.sed(
      '-i',
      'declare class gdEventsFunctionsExtension {',
      'declare class gdEventsFunctionsExtension extends gdEventsFunctionsContainer {',
      'types/gdeventsfunctionsextension.js'
    );
    shell.sed(
      '-i',
      'declare class gdObjectJsImplementation {',
      'declare class gdObjectJsImplementation extends gdObject {',
      'types/gdobjectjsimplementation.js'
    );
    shell.sed(
      '-i',
      'declare class gdBehaviorJsImplementation {',
      'declare class gdBehaviorJsImplementation extends gdBehavior {',
      'types/gdbehaviorjsimplementation.js'
    );
    shell.sed(
      '-i',
      'declare class gdBehaviorSharedDataJsImplementation {',
      'declare class gdBehaviorSharedDataJsImplementation extends gdBehaviorsSharedData {',
      'types/gdbehaviorshareddatajsimplementation.js'
    );
    shell.sed(
      '-i',
      'declare class gdJsPlatform {',
      'declare class gdJsPlatform extends gdPlatform {',
      'types/gdjsplatform.js'
    );
    shell.sed(
      '-i',
      'declare class gdExpressionValidator {',
      'declare class gdExpressionValidator extends gdExpressionParser2NodeWorker {',
      'types/gdexpressionvalidator.js'
    );
    shell.sed(
      '-i',
      'declare class gdHighestZOrderFinder {',
      'declare class gdHighestZOrderFinder extends gdInitialInstanceFunctor {',
      'types/gdhighestzorderfinder.js'
    );
    shell.sed(
      '-i',
      'declare class gdGroupEvent {',
      'declare class gdGroupEvent extends gdBaseEvent {',
      'types/gdgroupevent.js'
    );
    [
      'BaseEvent',
      'StandardEvent',
      'RepeatEvent',
      'WhileEvent',
      'ForEachEvent',
      'CommentEvent',
      'GroupEvent',
      'LinkEvent',
      'JsCodeEvent',
    ].forEach((eventClassName) => {
      shell.sed(
        '-i',
        `declare class gd${eventClassName} {`,
        `declare class gd${eventClassName} extends gdBaseEvent {`,
        `types/gd${eventClassName.toLowerCase()}.js`
      );
    });

    // Rename classes from GDJS:
    shell.sed(
      '-i',
      'declare class gdExporter {',
      'declare class gdjsExporter {',
      'types/gdexporter.js'
    );

    // Improve typing of resources kind.
    shell.sed(
      '-i',
      /setKind\(kind: string\): void/,
      "setKind(kind: 'image' | 'audio' | 'font' | 'video' | 'json'): void",
      'types/gdresource.js'
    );
    shell.sed(
      '-i',
      /getKind\(\): string/,
      "getKind(): 'image' | 'audio' | 'font' | 'video' | 'json'",
      'types/gdresource.js'
    );

    // Add missing declaration of set_/get_ functions, automatically added by Emscripten
    // for attributes:
    shell.sed(
      '-i',
      'x: number;',
      'x: number;\n  set_x(number): void;\n  get_x(): number;',
      'types/gdvector2f.js'
    );
    shell.sed(
      '-i',
      'y: number;',
      'y: number;\n  set_y(number): void;\n  get_y(): number;',
      'types/gdvector2f.js'
    );

    // Set a few parameters as optionals. No parameter is ever optional when compiled in Emscripten,
    // but passing undefined is tolerated for these and it's convenient:
    shell.sed(
      '-i',
      'type: string, description: string, optionalObjectType: string, parameterIsOptional: boolean',
      'type: string, description: string, optionalObjectType?: string, parameterIsOptional?: boolean',
      'types/gdinstructionmetadata.js'
    );
    shell.sed(
      '-i',
      'type: string, description: string, optionalObjectType: string, parameterIsOptional: boolean',
      'type: string, description: string, optionalObjectType?: string, parameterIsOptional?: boolean',
      'types/gdexpressionmetadata.js'
    );

    // Add a notice that the file is auto-generated.
    shell.sed(
      '-i',
      'declare class',
      '// Automatically generated by GDevelop.js/scripts/generate-types.js\ndeclare class',
      'types/*.js'
    );

    shell.echo('✅ Properly generated GDevelop.js types.');
  }
);