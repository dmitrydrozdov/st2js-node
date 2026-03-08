// Generated from /Users/dmitriid/Documents/code_ext_test_1/st2js/grammar/ST.g4 by ANTLR 4.13.1
import org.antlr.v4.runtime.tree.ParseTreeListener;

/**
 * This interface defines a complete listener for a parse tree produced by
 * {@link STParser}.
 */
public interface STListener extends ParseTreeListener {
	/**
	 * Enter a parse tree produced by {@link STParser#compilationUnit}.
	 * @param ctx the parse tree
	 */
	void enterCompilationUnit(STParser.CompilationUnitContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#compilationUnit}.
	 * @param ctx the parse tree
	 */
	void exitCompilationUnit(STParser.CompilationUnitContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#functionDeclaration}.
	 * @param ctx the parse tree
	 */
	void enterFunctionDeclaration(STParser.FunctionDeclarationContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#functionDeclaration}.
	 * @param ctx the parse tree
	 */
	void exitFunctionDeclaration(STParser.FunctionDeclarationContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#functionBlockDeclaration}.
	 * @param ctx the parse tree
	 */
	void enterFunctionBlockDeclaration(STParser.FunctionBlockDeclarationContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#functionBlockDeclaration}.
	 * @param ctx the parse tree
	 */
	void exitFunctionBlockDeclaration(STParser.FunctionBlockDeclarationContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#programDeclaration}.
	 * @param ctx the parse tree
	 */
	void enterProgramDeclaration(STParser.ProgramDeclarationContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#programDeclaration}.
	 * @param ctx the parse tree
	 */
	void exitProgramDeclaration(STParser.ProgramDeclarationContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#typeDeclaration}.
	 * @param ctx the parse tree
	 */
	void enterTypeDeclaration(STParser.TypeDeclarationContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#typeDeclaration}.
	 * @param ctx the parse tree
	 */
	void exitTypeDeclaration(STParser.TypeDeclarationContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#typeDefinition}.
	 * @param ctx the parse tree
	 */
	void enterTypeDefinition(STParser.TypeDefinitionContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#typeDefinition}.
	 * @param ctx the parse tree
	 */
	void exitTypeDefinition(STParser.TypeDefinitionContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#typeSpec}.
	 * @param ctx the parse tree
	 */
	void enterTypeSpec(STParser.TypeSpecContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#typeSpec}.
	 * @param ctx the parse tree
	 */
	void exitTypeSpec(STParser.TypeSpecContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#structSpec}.
	 * @param ctx the parse tree
	 */
	void enterStructSpec(STParser.StructSpecContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#structSpec}.
	 * @param ctx the parse tree
	 */
	void exitStructSpec(STParser.StructSpecContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#structField}.
	 * @param ctx the parse tree
	 */
	void enterStructField(STParser.StructFieldContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#structField}.
	 * @param ctx the parse tree
	 */
	void exitStructField(STParser.StructFieldContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#enumSpec}.
	 * @param ctx the parse tree
	 */
	void enterEnumSpec(STParser.EnumSpecContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#enumSpec}.
	 * @param ctx the parse tree
	 */
	void exitEnumSpec(STParser.EnumSpecContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#enumValue}.
	 * @param ctx the parse tree
	 */
	void enterEnumValue(STParser.EnumValueContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#enumValue}.
	 * @param ctx the parse tree
	 */
	void exitEnumValue(STParser.EnumValueContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#subrangeSpec}.
	 * @param ctx the parse tree
	 */
	void enterSubrangeSpec(STParser.SubrangeSpecContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#subrangeSpec}.
	 * @param ctx the parse tree
	 */
	void exitSubrangeSpec(STParser.SubrangeSpecContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#varSection}.
	 * @param ctx the parse tree
	 */
	void enterVarSection(STParser.VarSectionContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#varSection}.
	 * @param ctx the parse tree
	 */
	void exitVarSection(STParser.VarSectionContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#varKeyword}.
	 * @param ctx the parse tree
	 */
	void enterVarKeyword(STParser.VarKeywordContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#varKeyword}.
	 * @param ctx the parse tree
	 */
	void exitVarKeyword(STParser.VarKeywordContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#varModifier}.
	 * @param ctx the parse tree
	 */
	void enterVarModifier(STParser.VarModifierContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#varModifier}.
	 * @param ctx the parse tree
	 */
	void exitVarModifier(STParser.VarModifierContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#varDeclaration}.
	 * @param ctx the parse tree
	 */
	void enterVarDeclaration(STParser.VarDeclarationContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#varDeclaration}.
	 * @param ctx the parse tree
	 */
	void exitVarDeclaration(STParser.VarDeclarationContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#identifierList}.
	 * @param ctx the parse tree
	 */
	void enterIdentifierList(STParser.IdentifierListContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#identifierList}.
	 * @param ctx the parse tree
	 */
	void exitIdentifierList(STParser.IdentifierListContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#directVariable}.
	 * @param ctx the parse tree
	 */
	void enterDirectVariable(STParser.DirectVariableContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#directVariable}.
	 * @param ctx the parse tree
	 */
	void exitDirectVariable(STParser.DirectVariableContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#dataType}.
	 * @param ctx the parse tree
	 */
	void enterDataType(STParser.DataTypeContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#dataType}.
	 * @param ctx the parse tree
	 */
	void exitDataType(STParser.DataTypeContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#primitiveType}.
	 * @param ctx the parse tree
	 */
	void enterPrimitiveType(STParser.PrimitiveTypeContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#primitiveType}.
	 * @param ctx the parse tree
	 */
	void exitPrimitiveType(STParser.PrimitiveTypeContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#arrayType}.
	 * @param ctx the parse tree
	 */
	void enterArrayType(STParser.ArrayTypeContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#arrayType}.
	 * @param ctx the parse tree
	 */
	void exitArrayType(STParser.ArrayTypeContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#subrange}.
	 * @param ctx the parse tree
	 */
	void enterSubrange(STParser.SubrangeContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#subrange}.
	 * @param ctx the parse tree
	 */
	void exitSubrange(STParser.SubrangeContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#stringType}.
	 * @param ctx the parse tree
	 */
	void enterStringType(STParser.StringTypeContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#stringType}.
	 * @param ctx the parse tree
	 */
	void exitStringType(STParser.StringTypeContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#arraySpec}.
	 * @param ctx the parse tree
	 */
	void enterArraySpec(STParser.ArraySpecContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#arraySpec}.
	 * @param ctx the parse tree
	 */
	void exitArraySpec(STParser.ArraySpecContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#statementList}.
	 * @param ctx the parse tree
	 */
	void enterStatementList(STParser.StatementListContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#statementList}.
	 * @param ctx the parse tree
	 */
	void exitStatementList(STParser.StatementListContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#statement}.
	 * @param ctx the parse tree
	 */
	void enterStatement(STParser.StatementContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#statement}.
	 * @param ctx the parse tree
	 */
	void exitStatement(STParser.StatementContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#assignmentStatement}.
	 * @param ctx the parse tree
	 */
	void enterAssignmentStatement(STParser.AssignmentStatementContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#assignmentStatement}.
	 * @param ctx the parse tree
	 */
	void exitAssignmentStatement(STParser.AssignmentStatementContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#ifStatement}.
	 * @param ctx the parse tree
	 */
	void enterIfStatement(STParser.IfStatementContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#ifStatement}.
	 * @param ctx the parse tree
	 */
	void exitIfStatement(STParser.IfStatementContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#caseStatement}.
	 * @param ctx the parse tree
	 */
	void enterCaseStatement(STParser.CaseStatementContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#caseStatement}.
	 * @param ctx the parse tree
	 */
	void exitCaseStatement(STParser.CaseStatementContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#caseClause}.
	 * @param ctx the parse tree
	 */
	void enterCaseClause(STParser.CaseClauseContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#caseClause}.
	 * @param ctx the parse tree
	 */
	void exitCaseClause(STParser.CaseClauseContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#caseLabel}.
	 * @param ctx the parse tree
	 */
	void enterCaseLabel(STParser.CaseLabelContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#caseLabel}.
	 * @param ctx the parse tree
	 */
	void exitCaseLabel(STParser.CaseLabelContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#forStatement}.
	 * @param ctx the parse tree
	 */
	void enterForStatement(STParser.ForStatementContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#forStatement}.
	 * @param ctx the parse tree
	 */
	void exitForStatement(STParser.ForStatementContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#whileStatement}.
	 * @param ctx the parse tree
	 */
	void enterWhileStatement(STParser.WhileStatementContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#whileStatement}.
	 * @param ctx the parse tree
	 */
	void exitWhileStatement(STParser.WhileStatementContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#repeatStatement}.
	 * @param ctx the parse tree
	 */
	void enterRepeatStatement(STParser.RepeatStatementContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#repeatStatement}.
	 * @param ctx the parse tree
	 */
	void exitRepeatStatement(STParser.RepeatStatementContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#returnStatement}.
	 * @param ctx the parse tree
	 */
	void enterReturnStatement(STParser.ReturnStatementContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#returnStatement}.
	 * @param ctx the parse tree
	 */
	void exitReturnStatement(STParser.ReturnStatementContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#exitStatement}.
	 * @param ctx the parse tree
	 */
	void enterExitStatement(STParser.ExitStatementContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#exitStatement}.
	 * @param ctx the parse tree
	 */
	void exitExitStatement(STParser.ExitStatementContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#continueStatement}.
	 * @param ctx the parse tree
	 */
	void enterContinueStatement(STParser.ContinueStatementContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#continueStatement}.
	 * @param ctx the parse tree
	 */
	void exitContinueStatement(STParser.ContinueStatementContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#functionCallStatement}.
	 * @param ctx the parse tree
	 */
	void enterFunctionCallStatement(STParser.FunctionCallStatementContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#functionCallStatement}.
	 * @param ctx the parse tree
	 */
	void exitFunctionCallStatement(STParser.FunctionCallStatementContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#expression}.
	 * @param ctx the parse tree
	 */
	void enterExpression(STParser.ExpressionContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#expression}.
	 * @param ctx the parse tree
	 */
	void exitExpression(STParser.ExpressionContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#orExpression}.
	 * @param ctx the parse tree
	 */
	void enterOrExpression(STParser.OrExpressionContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#orExpression}.
	 * @param ctx the parse tree
	 */
	void exitOrExpression(STParser.OrExpressionContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#xorExpression}.
	 * @param ctx the parse tree
	 */
	void enterXorExpression(STParser.XorExpressionContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#xorExpression}.
	 * @param ctx the parse tree
	 */
	void exitXorExpression(STParser.XorExpressionContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#andExpression}.
	 * @param ctx the parse tree
	 */
	void enterAndExpression(STParser.AndExpressionContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#andExpression}.
	 * @param ctx the parse tree
	 */
	void exitAndExpression(STParser.AndExpressionContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#comparison}.
	 * @param ctx the parse tree
	 */
	void enterComparison(STParser.ComparisonContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#comparison}.
	 * @param ctx the parse tree
	 */
	void exitComparison(STParser.ComparisonContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#addExpression}.
	 * @param ctx the parse tree
	 */
	void enterAddExpression(STParser.AddExpressionContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#addExpression}.
	 * @param ctx the parse tree
	 */
	void exitAddExpression(STParser.AddExpressionContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#mulExpression}.
	 * @param ctx the parse tree
	 */
	void enterMulExpression(STParser.MulExpressionContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#mulExpression}.
	 * @param ctx the parse tree
	 */
	void exitMulExpression(STParser.MulExpressionContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#powerExpression}.
	 * @param ctx the parse tree
	 */
	void enterPowerExpression(STParser.PowerExpressionContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#powerExpression}.
	 * @param ctx the parse tree
	 */
	void exitPowerExpression(STParser.PowerExpressionContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#unaryExpression}.
	 * @param ctx the parse tree
	 */
	void enterUnaryExpression(STParser.UnaryExpressionContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#unaryExpression}.
	 * @param ctx the parse tree
	 */
	void exitUnaryExpression(STParser.UnaryExpressionContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#primaryExpression}.
	 * @param ctx the parse tree
	 */
	void enterPrimaryExpression(STParser.PrimaryExpressionContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#primaryExpression}.
	 * @param ctx the parse tree
	 */
	void exitPrimaryExpression(STParser.PrimaryExpressionContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#variable}.
	 * @param ctx the parse tree
	 */
	void enterVariable(STParser.VariableContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#variable}.
	 * @param ctx the parse tree
	 */
	void exitVariable(STParser.VariableContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#functionCall}.
	 * @param ctx the parse tree
	 */
	void enterFunctionCall(STParser.FunctionCallContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#functionCall}.
	 * @param ctx the parse tree
	 */
	void exitFunctionCall(STParser.FunctionCallContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#argumentList}.
	 * @param ctx the parse tree
	 */
	void enterArgumentList(STParser.ArgumentListContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#argumentList}.
	 * @param ctx the parse tree
	 */
	void exitArgumentList(STParser.ArgumentListContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#argument}.
	 * @param ctx the parse tree
	 */
	void enterArgument(STParser.ArgumentContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#argument}.
	 * @param ctx the parse tree
	 */
	void exitArgument(STParser.ArgumentContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#literal}.
	 * @param ctx the parse tree
	 */
	void enterLiteral(STParser.LiteralContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#literal}.
	 * @param ctx the parse tree
	 */
	void exitLiteral(STParser.LiteralContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#typedLiteral}.
	 * @param ctx the parse tree
	 */
	void enterTypedLiteral(STParser.TypedLiteralContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#typedLiteral}.
	 * @param ctx the parse tree
	 */
	void exitTypedLiteral(STParser.TypedLiteralContext ctx);
	/**
	 * Enter a parse tree produced by {@link STParser#identifier}.
	 * @param ctx the parse tree
	 */
	void enterIdentifier(STParser.IdentifierContext ctx);
	/**
	 * Exit a parse tree produced by {@link STParser#identifier}.
	 * @param ctx the parse tree
	 */
	void exitIdentifier(STParser.IdentifierContext ctx);
}