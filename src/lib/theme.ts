import { createTheme } from "@mui/material/styles";

// Tavern at night: dark timber walls, brass fittings, parchment, sealing wax.
export const theme = createTheme({
  palette: {
    mode: "dark",
    background: { default: "#1c140e", paper: "#2a1f16" },
    primary: { main: "#d2a85a", contrastText: "#1c140e" },
    secondary: { main: "#b5402f" },
    text: { primary: "#f1e4c8", secondary: "#c4b08c" },
    divider: "rgba(241, 228, 200, 0.14)",
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: '"Alegreya Sans", system-ui, sans-serif',
    h1: { fontFamily: '"Rye", serif', fontWeight: 400 },
    h2: { fontFamily: '"Rye", serif', fontWeight: 400 },
    h3: { fontFamily: '"IM Fell English", serif' },
    h4: { fontFamily: '"IM Fell English", serif' },
    h5: { fontFamily: '"IM Fell English", serif' },
    h6: { fontFamily: '"IM Fell English", serif' },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    // A ring you can see from across the table when tabbing, on dark wood or parchment.
    MuiButtonBase: {
      styleOverrides: {
        root: { "&.Mui-focusVisible": { outline: "3px solid #d2a85a", outlineOffset: 2, boxShadow: "0 0 0 5px #1c140e" } },
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
  },
});
