import { createTheme } from "@mui/material/styles";
import { theme } from "@/lib/theme";

/** The builder's forms sit on parchment: ink text, wax for errors, brass focus rings. */
export const parchmentTheme = createTheme({
  ...theme,
  palette: {
    mode: "light",
    background: { default: "#f3e7cb", paper: "#f6ecd4" },
    primary: { main: "#5b4426", contrastText: "#f3e7cb" },
    secondary: { main: "#9e2f22", contrastText: "#fff3df" },
    error: { main: "#9e2f22" },
    warning: { main: "#8a5a10" },
    text: { primary: "#2b1d0e", secondary: "#5b4426" },
    divider: "rgba(43, 29, 14, 0.2)",
  },
  typography: {
    ...theme.typography,
    fontFamily: '"Alegreya", "Alegreya Sans", serif',
  },
  components: {
    ...theme.components,
    MuiOutlinedInput: {
      styleOverrides: {
        root: { backgroundColor: "rgba(255, 255, 255, 0.45)" },
      },
    },
    MuiInputLabel: { styleOverrides: { root: { fontFamily: '"Alegreya Sans SC", sans-serif' } } },
  },
});
