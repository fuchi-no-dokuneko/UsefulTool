(function blockOutbound() {
  const deny = function () { throw new Error("Outbound network calls are disabled in UsefulTool."); };
  window.fetch = deny;
  window.XMLHttpRequest = deny;
  window.WebSocket = deny;
  window.EventSource = deny;
  if (navigator.sendBeacon) navigator.sendBeacon = function () { return false; };
})();

const categories = {
  Length: {
    base: "meter",
    units: {
      "angstrom": 1e-10,
      "nanometer": 1e-9,
      "micrometer": 0.000001,
      "millimeter": 0.001,
      "centimeter": 0.01,
      "decimeter": 0.1,
      "meter": 1,
      "kilometer": 1000,
      "mil": 0.0000254,
      "inch": 0.0254,
      "foot": 0.3048,
      "yard": 0.9144,
      "chain": 20.1168,
      "furlong": 201.168,
      "mile": 1609.344,
      "nautical mile": 1852,
      "astronomical unit": 149597870700,
      "light-year": 9460730472580800,
        "parsec": 3.085677581491367e16
    },
    quick: [["1 in to cm", "1", "inch", "centimeter"], ["1 mi to km", "1", "mile", "kilometer"], ["100 m to ft", "100", "meter", "foot"]]
  },
  Area: {
    base: "square meter",
    units: {
      "square millimeter": 0.000001,
      "square centimeter": 0.0001,
      "square meter": 1,
      "are": 100,
      "hectare": 10000,
      "square kilometer": 1000000,
      "square inch": 0.00064516,
      "square foot": 0.09290304,
      "square yard": 0.83612736,
      "acre": 4046.8564224,
      "square mile": 2589988.110336,
      "barn": 1e-28
    },
    quick: [["1 acre to m2", "1", "acre", "square meter"], ["100 ft2 to m2", "100", "square foot", "square meter"]]
  },
  Mass: {
    base: "gram",
    units: {
      "microgram": 0.000001,
      "milligram": 0.001,
      "gram": 1,
      "kilogram": 1000,
      "carat": 0.2,
      "grain": 0.06479891,
      "metric ton": 1000000,
      "ounce": 28.349523125,
      "pound": 453.59237,
      "stone": 6350.29318,
      "slug": 14593.90294,
      "short ton US": 907184.74,
      "long ton UK": 1016046.9088
    },
    quick: [["1 lb to kg", "1", "pound", "kilogram"], ["1 kg to oz", "1", "kilogram", "ounce"]]
  },
  Volume: {
    base: "liter",
    units: {
      "milliliter": 0.001,
      "liter": 1,
      "cubic centimeter": 0.001,
      "cubic meter": 1000,
      "cubic inch": 0.016387064,
      "cubic foot": 28.316846592,
      "teaspoon US": 0.00492892159375,
      "tablespoon US": 0.01478676478125,
      "fluid ounce US": 0.0295735295625,
      "cup US": 0.2365882365,
      "pint US": 0.473176473,
      "quart US": 0.946352946,
      "gallon US": 3.785411784,
      "fluid ounce UK": 0.0284130625,
      "pint UK": 0.56826125,
      "gallon UK": 4.54609,
      "oil barrel": 158.987294928
    },
    quick: [["1 gal to L", "1", "gallon US", "liter"], ["2 cups to ml", "2", "cup US", "milliliter"]]
  },
  Temperature: {
    affine: true,
    units: ["celsius", "fahrenheit", "kelvin", "rankine"],
    quick: [["32 F to C", "32", "fahrenheit", "celsius"], ["100 C to F", "100", "celsius", "fahrenheit"]]
  },
  Speed: {
    base: "meter per second",
    units: {
      "meter per second": 1,
      "kilometer per hour": 0.2777777777777778,
      "mile per hour": 0.44704,
      "foot per second": 0.3048,
      "knot": 0.5144444444444445,
      "mach (standard atmosphere)": 340.29,
      "speed of light": 299792458
    },
    quick: [["60 mph to km/h", "60", "mile per hour", "kilometer per hour"], ["10 m/s to mph", "10", "meter per second", "mile per hour"]]
  },
  Pressure: {
    base: "pascal",
    units: {
      "pascal": 1,
      "hectopascal": 100,
      "kilopascal": 1000,
      "megapascal": 1000000,
      "bar": 100000,
      "atmosphere": 101325,
      "psi": 6894.757293168,
      "torr": 133.3223684211,
      "millimeter mercury": 133.322387415,
      "inch mercury": 3386.389,
      "kilogram-force per cm2": 98066.5
    },
    quick: [["1 atm to psi", "1", "atmosphere", "psi"], ["35 psi to kPa", "35", "psi", "kilopascal"]]
  },
  Energy: {
    base: "joule",
    units: {
      "joule": 1,
      "kilojoule": 1000,
      "megajoule": 1000000,
      "calorie": 4.184,
      "kilocalorie": 4184,
      "watt hour": 3600,
      "kilowatt hour": 3600000,
      "BTU": 1055.05585262,
      "electronvolt": 1.602176634e-19,
      "erg": 1e-7,
      "foot-pound": 1.3558179483314,
      "therm US": 105480400
    },
    quick: [["1 kWh to J", "1", "kilowatt hour", "joule"], ["500 kcal to kJ", "500", "kilocalorie", "kilojoule"]]
  },
  Data: {
    base: "byte",
    units: {
      "bit": 0.125,
      "byte": 1,
      "kilobyte": 1000,
      "megabyte": 1000000,
      "gigabyte": 1000000000,
      "terabyte": 1000000000000,
      "petabyte": 1000000000000000,
      "kibibyte": 1024,
      "mebibyte": 1048576,
      "gibibyte": 1073741824,
      "tebibyte": 1099511627776,
      "pebibyte": 1125899906842624
    },
    quick: [["1 GiB to MB", "1", "gibibyte", "megabyte"], ["100 Mbps to MB", "100000000", "bit", "megabyte"]]
  },
  Time: {
    base: "second",
    units: {
      "nanosecond": 1e-9,
      "microsecond": 0.000001,
      "millisecond": 0.001,
      "second": 1,
      "minute": 60,
      "hour": 3600,
      "day": 86400,
      "week": 604800,
      "fortnight": 1209600,
      "common year": 31536000,
      "julian year": 31557600
    },
    quick: [["1 day to hours", "1", "day", "hour"], ["90 min to hours", "90", "minute", "hour"]]
  },
  Angle: {
    base: "radian",
    units: {
      "radian": 1,
      "degree": 0.017453292519943295,
      "gradian": 0.015707963267948967,
      "arcminute": 0.0002908882086657216,
      "arcsecond": 0.00000484813681109536,
      "turn": 6.283185307179586
    },
    quick: [["180 deg to rad", "180", "degree", "radian"], ["1 turn to deg", "1", "turn", "degree"]]
  },
  Power: {
    base: "watt",
    units: {
      "milliwatt": 0.001,
      "watt": 1,
      "kilowatt": 1000,
      "megawatt": 1000000,
      "gigawatt": 1000000000,
      "horsepower mechanical": 745.6998715822702,
      "horsepower metric": 735.49875,
      "BTU per hour": 0.2930710701722222,
      "kilocalorie per hour": 1.163
    },
    quick: [["1 hp to kW", "1", "horsepower mechanical", "kilowatt"], ["1000 W to hp", "1000", "watt", "horsepower mechanical"]]
  },
  Force: {
    base: "newton",
    units: {
      "millinewton": 0.001,
      "newton": 1,
      "kilonewton": 1000,
      "dyne": 0.00001,
      "pound-force": 4.4482216152605,
      "kilogram-force": 9.80665,
      "kip-force": 4448.2216152605
    },
    quick: [["1 lbf to N", "1", "pound-force", "newton"], ["100 N to kgf", "100", "newton", "kilogram-force"]]
  },
  Frequency: {
    base: "hertz",
    units: {
      "millihertz": 0.001,
      "hertz": 1,
      "kilohertz": 1000,
      "megahertz": 1000000,
      "gigahertz": 1000000000,
      "revolution per minute": 0.016666666666666666,
      "beat per minute": 0.016666666666666666
    },
    quick: [["60 rpm to Hz", "60", "revolution per minute", "hertz"], ["2.4 GHz to MHz", "2.4", "gigahertz", "megahertz"]]
  },
  Torque: {
    base: "newton meter",
    units: {
      "newton millimeter": 0.001,
      "newton meter": 1,
      "kilonewton meter": 1000,
      "pound-force inch": 0.1129848290276167,
      "pound-force foot": 1.3558179483314,
      "kilogram-force meter": 9.80665
    },
    quick: [["100 Nm to lb-ft", "100", "newton meter", "pound-force foot"], ["50 lb-ft to Nm", "50", "pound-force foot", "newton meter"]]
  },
  Density: {
    base: "kilogram per cubic meter",
    units: {
      "kilogram per cubic meter": 1,
      "gram per liter": 1,
      "gram per cubic centimeter": 1000,
      "kilogram per liter": 1000,
      "pound per cubic foot": 16.01846337396,
      "pound per US gallon": 119.826427316
    },
    quick: [["1 g/cm3 to kg/m3", "1", "gram per cubic centimeter", "kilogram per cubic meter"], ["62.4 lb/ft3 to kg/m3", "62.4", "pound per cubic foot", "kilogram per cubic meter"]]
  },
  "Data rate": {
    base: "bit per second",
    units: {
      "bit per second": 1,
      "kilobit per second": 1000,
      "megabit per second": 1000000,
      "gigabit per second": 1000000000,
      "byte per second": 8,
      "kilobyte per second": 8000,
      "megabyte per second": 8000000,
      "kibibyte per second": 8192,
      "mebibyte per second": 8388608
    },
    quick: [["100 Mbps to MB/s", "100", "megabit per second", "megabyte per second"], ["1 GiB/s to Gbps", "1024", "mebibyte per second", "gigabit per second"]]
  },
  Acceleration: {
    base: "meter per second squared",
    units: {
      "meter per second squared": 1,
      "foot per second squared": 0.3048,
      "gal": 0.01,
      "standard gravity": 9.80665
    },
    quick: [["1 g to m/s2", "1", "standard gravity", "meter per second squared"], ["100 Gal to m/s2", "100", "gal", "meter per second squared"]]
  }
};

const category = document.getElementById("category");
const value = document.getElementById("value");
const fromUnit = document.getElementById("fromUnit");
const toUnit = document.getElementById("toUnit");
const swapButton = document.getElementById("swapButton");
const quickButtons = document.getElementById("quickButtons");
const mainResult = document.getElementById("mainResult");
const resultLabel = document.getElementById("resultLabel");
const cards = document.getElementById("cards");
const formula = document.getElementById("formula");
const sourceButton = document.getElementById("sourceButton");

function option(text) {
  const item = document.createElement("option");
  item.value = text;
  item.textContent = text;
  return item;
}

function unitNames(data) {
  return data.affine ? data.units : Object.keys(data.units);
}

function toCelsius(amount, unit) {
  if (unit === "celsius") return amount;
  if (unit === "fahrenheit") return (amount - 32) * 5 / 9;
  if (unit === "rankine") return amount * 5 / 9 - 273.15;
  return amount - 273.15;
}

function fromCelsius(amount, unit) {
  if (unit === "celsius") return amount;
  if (unit === "fahrenheit") return amount * 9 / 5 + 32;
  if (unit === "rankine") return (amount + 273.15) * 9 / 5;
  return amount + 273.15;
}

function convert(amount, from, to, data) {
  if (data.affine) return fromCelsius(toCelsius(amount, from), to);
  return amount * data.units[from] / data.units[to];
}

function formatNumber(number) {
  if (!Number.isFinite(number)) return "not finite";
  if (Math.abs(number) >= 1e12 || (Math.abs(number) > 0 && Math.abs(number) < 1e-8)) return number.toExponential(10).replace(/\.?0+e/, "e");
  return Number(number.toPrecision(12)).toString();
}

function setUnits() {
  const data = categories[category.value];
  const names = unitNames(data);
  fromUnit.replaceChildren(...names.map(option));
  toUnit.replaceChildren(...names.map(option));
  toUnit.selectedIndex = Math.min(1, names.length - 1);
  quickButtons.replaceChildren();
  data.quick.forEach((preset) => {
    const button = document.createElement("button");
    button.className = "button";
    button.type = "button";
    button.textContent = preset[0];
    button.addEventListener("click", () => {
      value.value = preset[1];
      fromUnit.value = preset[2];
      toUnit.value = preset[3];
      render();
    });
    quickButtons.appendChild(button);
  });
  render();
}

function render() {
  const data = categories[category.value];
  const amount = Number(value.value.trim());
  cards.replaceChildren();
  if (!Number.isFinite(amount)) {
    mainResult.textContent = "Invalid number";
    resultLabel.textContent = "Enter a finite numeric value.";
    return;
  }
  const converted = convert(amount, fromUnit.value, toUnit.value, data);
  mainResult.textContent = formatNumber(converted);
  resultLabel.textContent = value.value + " " + fromUnit.value + " = " + toUnit.value;
  unitNames(data).forEach((unit) => {
    const li = document.createElement("li");
    li.className = "card";
    const name = document.createElement("div");
    name.className = "unit-name";
    name.textContent = unit;
    const number = document.createElement("div");
    number.className = "unit-value";
    number.textContent = formatNumber(convert(amount, fromUnit.value, unit, data));
    li.append(name, number);
    cards.appendChild(li);
  });
  if (data.affine) {
    formula.textContent = "Temperature uses celsius as the neutral calculation point.";
  } else {
    formula.textContent = "Base unit: " + data.base + ". Formula: value * from-factor / to-factor.";
  }
}

Object.keys(categories).forEach((name) => category.appendChild(option(name)));
category.addEventListener("change", setUnits);
value.addEventListener("input", render);
fromUnit.addEventListener("change", render);
toUnit.addEventListener("change", render);
swapButton.addEventListener("click", () => {
  const oldFrom = fromUnit.value;
  fromUnit.value = toUnit.value;
  toUnit.value = oldFrom;
  render();
});
sourceButton.addEventListener("click", () => {
  window.open("view-source:" + location.href, "_blank", "noopener,noreferrer");
});
window.UsefulToolUnits = { categories, convert, toCelsius, fromCelsius, formatNumber };
setUnits();
