function drawCharacter(grid, character, context) {
    context.beginPath();

    switch (character) {
        case '{':

            context.moveTo(grid.X(1), grid.Y(1));
            context.bezierCurveTo(grid.X(1.5), grid.Y(0.8), grid.X(1.5), grid.Y(0.2), grid.X(1), grid.Y(0));
            context.moveTo(grid.X(1.5), grid.Y(0.8));
            context.lineTo(grid.X(2), grid.Y(0.8));
            context.moveTo(grid.X(1.5), grid.Y(0.2));
            context.lineTo(grid.X(2), grid.Y(0.2));
            break;

        case '}':

            context.moveTo(grid.X(2), grid.Y(1));
            context.bezierCurveTo(grid.X(1.5), grid.Y(0.8), grid.X(1.5), grid.Y(0.2), grid.X(2), grid.Y(0));
            context.moveTo(grid.X(1.5), grid.Y(0.8));
            context.lineTo(grid.X(1), grid.Y(0.8));
            context.moveTo(grid.X(1.5), grid.Y(0.2));
            context.lineTo(grid.X(1), grid.Y(0.2));
            break;

        case '[':

            context.moveTo(grid.X(1), grid.Y(1));
            context.lineTo(grid.X(1), grid.Y(0));
            context.lineTo(grid.X(1.5), grid.Y(0));
            context.lineTo(grid.X(1.5), grid.Y(1));
            break;

        case ']':

            context.moveTo(grid.X(1.5), grid.Y(1));
            context.lineTo(grid.X(1.5), grid.Y(0));
            context.lineTo(grid.X(2), grid.Y(0));
            context.lineTo(grid.X(2), grid.Y(1));
            break;

        case '-':

            context.moveTo(grid.X(1), grid.Y(0.5));
            context.lineTo(grid.X(2), grid.Y(0.5));
            break;

        case '+':

            context.moveTo(grid.X(1.5), grid.Y(0.2));
            context.lineTo(grid.X(1.5), grid.Y(0.8));
            context.moveTo(grid.X(1.2), grid.Y(0.5));
            context.lineTo(grid.X(1.8), grid.Y(0.5));
            break;

        case '*':

            context.moveTo(grid.X(1.2), grid.Y(0.2));
            context.lineTo(grid.X(1.8), grid.Y(0.8));
            context.moveTo(grid.X(1.8), grid.Y(0.2));
            context.lineTo(grid.X(1.2), grid.Y(0.8));
            context.moveTo(grid.X(1.5), grid.Y(0.1));
            context.lineTo(grid.X(1.5), grid.Y(0.9));
            context.moveTo(grid.X(1.1), grid.Y(0.5));
            context.lineTo(grid.X(1.9), grid.Y(0.5));
            break;

        case '/':

            context.moveTo(grid.X(1), grid.Y(1));
            context.lineTo(grid.X(2), grid.Y(0));
            break;

        default:
            console.error("Unsupported character");
            return;
    }

    context.stroke();
}
