export type ColorConfiguration = keyof typeof colorConfigurations;

export const colorConfigurations = {
  default: {
    gradient: [
      "hsl(240deg 100% 20%)", // Deep blue
      "hsl(281deg 100% 21%)", // Deep purple
      "hsl(304deg 100% 23%)", // Deep magenta
      "hsl(319deg 100% 30%)", // Rich pink
      "hsl(329deg 100% 36%)", // Bright pink
      "hsl(336deg 100% 41%)", // Hot pink
      "hsl(346deg 83% 51%)", // Coral pink
      "hsl(3deg 95% 61%)", // Salmon
      "hsl(17deg 100% 59%)", // Peach
      "hsl(30deg 100% 55%)", // Orange
      "hsl(40deg 100% 50%)", // Amber
      "hsl(48deg 100% 50%)", // Yellow
      "hsl(55deg 100% 50%)", // Lime
    ]
  },
  fire: {
    gradient: [
      "hsla(31, 100%, 50%, 1)",
      "hsla(356, 100%, 50%, 1)",
      "hsla(42, 100%, 56%, 1)",
    ]
  },
  red_to_purple: {
    gradient: [
      "hsla(333, 93%, 56%, 1)", // Rose
      "hsla(309, 77%, 40%, 1)", // Fandango
      "hsla(276, 91%, 38%, 1)", // Grape
      "hsla(268, 88%, 36%, 1)", // Chrysler Blue
      "hsla(263, 87%, 35%, 1)", // Dark Blue
      "hsla(258, 86%, 34%, 1)", // Zaffre
      "hsla(243, 57%, 50%, 1)", // Palatinate Blue
      "hsla(229, 83%, 60%, 1)", // Neon Blue
      "hsla(212, 84%, 61%, 1)", // Chefchaouen Blue
      "hsla(194, 85%, 62%, 1)", // Vivid Sky Blue
    ]
  },
  blue_to_yellow: {
    gradient: [
      "hsl(204deg 100% 22%)", // Deep navy
      "hsl(199deg 100% 29%)", // Royal blue
      "hsl(189deg 100% 32%)", // Turquoise
      "hsl(173deg 100% 33%)", // Teal
      "hsl(154deg 100% 39%)", // Emerald
      "hsl(89deg 70% 56%)", // Lime
      "hsl(55deg 100% 50%)", // Bright yellow
    ]
  },
  red_to_blue: {
    gradient: [
      "hsl(0deg 100% 50%)", // Bright red
      "hsl(330deg 100% 50%)", // Magenta
      "hsl(300deg 100% 50%)", // Purple
      "hsl(270deg 100% 50%)", // Violet
      "hsl(240deg 100% 50%)", // Blue
    ]
  },
  sunset: {
    gradient: [
      "hsl(200deg 100% 20%)", // Deep ocean blue
      "hsl(220deg 100% 30%)", // Royal purple
      "hsl(340deg 100% 40%)", // Deep rose
      "hsl(20deg 100% 50%)", // Bright orange
      "hsl(45deg 100% 60%)", // Golden yellow
    ]
  },
  blue_to_purple: {
    gradient: [
      "hsl(333deg 93% 56%)", // Rose
      "hsl(276deg 91% 38%)", // Grape
      "hsl(258deg 86% 34%)", // Zaffre
      "hsl(229deg 83% 60%)", // Neon blue
      "hsl(194deg 85% 62%)", // Vivid sky blue
    ]
  },
  blue_to_pink: {
    gradient: [
      "hsla(44, 100%, 52%, 1)", // Amber
      "hsla(19, 97%, 51%, 1)", // Orange pantone
      "hsla(334, 100%, 50%, 1)", // Rose
      "hsla(265, 83%, 57%, 1)", // Blue violet
      "hsla(217, 100%, 61%, 1)", // Azure
    ]
  },
  crazy: {
    gradient: [
      "hsla(43, 92%, 66%, 1)", // Golden yellow
      "hsla(355, 98%, 60%, 1)", // Red
      "hsla(281, 78%, 61%, 1)", // Purple
      "hsla(198, 99%, 78%, 1)", // Light blue
    ]
  },
  dusk: {
    gradient: [
      "hsla(315, 20%, 45%, 1)", // Dusky madder violet
      "hsla(228, 31%, 60%, 1)", // Deep lyons blue
      "hsla(320, 100%, 68%, 1)", // Eosine pink
      "hsla(25, 65%, 30%, 1)", // Hay's russe
    ]
  },
  rosolane_to_helvetia: {
    gradient: [
      "hsla(207, 70%, 37%, 1)", // Helvetia blue
      "hsla(288, 37%, 55%, 1)", // Rosolane purple
    ]
  }
}; 