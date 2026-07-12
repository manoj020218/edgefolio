package `in`.iotsoft.edgefolio.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary          = Color(0xFF1565C0),
    onPrimary        = Color.White,
    primaryContainer = Color(0xFFD6E4FF),
    secondary        = Color(0xFF00897B),
    onSecondary      = Color.White,
    error            = Color(0xFFB00020),
    background       = Color(0xFFF5F7FA),
    surface          = Color.White,
    onSurface        = Color(0xFF1A1C1E),
)

private val DarkColors = darkColorScheme(
    primary          = Color(0xFF90CAF9),
    onPrimary        = Color(0xFF003780),
    primaryContainer = Color(0xFF004BA0),
    secondary        = Color(0xFF80CBC4),
    background       = Color(0xFF1A1C1E),
    surface          = Color(0xFF2B2D30),
)

@Composable
fun EdgefolioTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColors else LightColors
    MaterialTheme(colorScheme = colorScheme, typography = Typography(), content = content)
}
