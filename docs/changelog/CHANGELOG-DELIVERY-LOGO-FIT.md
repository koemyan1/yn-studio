# Delivery truck + motorbike: logo fits the delivery box
- Truck: logo is now medium and sits fully inside the white cargo box (it used to poke above the purple stripe and below over the bumper/wheels).
- Motorbike: logo is now small and sits inside the delivery box on the back (it used to bulge out of the box).
- Done with an SVG clipPath, so the logo can never spill outside the box. Animation (bobbing, spinning wheels, moving road) is unchanged.
Edited: src/main.tsx (OrderScene). Not checked: npm run build / on-device test (checked by rendering the SVG in a browser).
