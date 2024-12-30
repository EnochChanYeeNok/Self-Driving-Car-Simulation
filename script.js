const canvas = document.getElementById('simulationCanvas');
const ctx = canvas.getContext('2d');

const CANVAS_WIDTH = canvas.width;
const CANVAS_HEIGHT = canvas.height;

// World Coordinates (larger than canvas to simulate movement)
let world = {
    width: 2000,
    height: 2000,
    roads: [],
};

// Camera to keep the self-driving car centered
let camera = {
    x: 0,
    y: 0,
};

// Car Class
class Car {
    constructor(x, y, width, height, color, isPlayer = false) {
        this.x = x; // World x
        this.y = y; // World y
        this.width = width;
        this.height = height;
        this.color = color;
        this.speed = 0;
        this.maxSpeed = 4;
        this.acceleration = 0.2;
        this.friction = 0.05;
        this.angle = 0; // Degrees
        this.isPlayer = isPlayer;
        this.sensors = new Sensors(this);
    }

    update(traffic, obstacles) {
        if (this.isPlayer) {
            this.move();
            this.sensors.update(traffic, obstacles);
        } else {
            // Simple AI for other cars: move forward and loop
            this.x += this.speed;
            if (this.x > world.width) {
                this.x = -this.width;
            }
        }
    }

    move() {
        // Simple AI: Move forward, obey traffic lights and avoid obstacles

        // Acceleration logic can be expanded
        // Here, we set a constant speed
        this.speed = this.maxSpeed;

        // Update position
        this.x += this.speed;
    }

    draw() {
        // Translate world coordinates to camera view
        const screenX = this.x - camera.x + CANVAS_WIDTH / 2 - this.width / 2;
        const screenY = this.y - camera.y + CANVAS_HEIGHT / 2 - this.height / 2;

        ctx.save();
        ctx.translate(screenX + this.width / 2, screenY + this.height / 2);
        ctx.rotate((this.angle * Math.PI) / 180);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        ctx.restore();

        // Draw sensors if player
        if (this.isPlayer) {
            this.sensors.draw();
        }
    }
}

// Sensors Class
class Sensors {
    constructor(car) {
        this.car = car;
        this.rayCount = 5;
        this.rayLength = 100;
        this.raySpread = 60; // Degrees
        this.rays = [];
        this.detected = [];
    }

    update(traffic, obstacles) {
        this.rays = [];
        this.detected = [];
        const startAngle = -this.raySpread / 2;
        const endAngle = this.raySpread / 2;
        const step = this.raySpread / (this.rayCount - 1);

        for (let i = 0; i < this.rayCount; i++) {
            const angle = this.car.angle + startAngle + step * i;
            const ray = this.castRay(angle, traffic, obstacles);
            this.rays.push(ray);
        }
    }

    castRay(angle, traffic, obstacles) {
        // Convert angle to radians
        const rad = (angle * Math.PI) / 180;
        const sin = Math.sin(rad);
        const cos = Math.cos(rad);

        // Define ray end point
        const endX = this.car.x + this.rayLength * cos;
        const endY = this.car.y + this.rayLength * sin;

        // Check intersections with traffic lights
        let closest = null;
        let minDist = Infinity;

        // Check obstacles
        obstacles.forEach((ob) => {
            const [x, y] = ob.getIntersection(this.car.x, this.car.y, endX, endY);
            if (x !== null && y !== null) {
                const dist = distance(this.car.x, this.car.y, x, y);
                if (dist < minDist) {
                    minDist = dist;
                    closest = { x, y };
                }
            }
        });

        // Check traffic lights
        traffic.forEach((tl) => {
            const [x, y] = tl.getIntersection(this.car.x, this.car.y, endX, endY);
            if (x !== null && y !== null) {
                const dist = distance(this.car.x, this.car.y, x, y);
                if (dist < minDist) {
                    minDist = dist;
                    closest = { x, y, state: tl.state };
                }
            }
        });

        if (closest) {
            this.detected.push(closest);
            return { x: closest.x, y: closest.y };
        } else {
            return { x: endX, y: endY };
        }
    }

    draw() {
        this.rays.forEach((ray, index) => {
            const screenStartX = this.car.x - camera.x + CANVAS_WIDTH / 2;
            const screenStartY = this.car.y - camera.y + CANVAS_HEIGHT / 2;

            const screenEndX = ray.x - camera.x + CANVAS_WIDTH / 2;
            const screenEndY = ray.y - camera.y + CANVAS_HEIGHT / 2;

            ctx.beginPath();
            ctx.moveTo(screenStartX, screenStartY);
            ctx.lineTo(screenEndX, screenEndY);
            ctx.strokeStyle = 'rgba(255,0,0,0.5)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw intersection point
            if (
                this.detected[index] &&
                distance(this.car.x, this.car.y, ray.x, ray.y) < this.rayLength
            ) {
                ctx.beginPath();
                ctx.arc(screenEndX, screenEndY, 5, 0, Math.PI * 2);
                ctx.fillStyle = 'yellow';
                ctx.fill();
            }
        });
    }
}

// Obstacle (Other Cars) Class
class ObstacleCar {
    constructor(x, y, width, height, color, speed = 2) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
        this.speed = speed;
    }

    update() {
        this.x += this.speed;
        if (this.x > world.width + this.width) {
            this.x = -this.width;
        }
    }

    draw() {
        const screenX = this.x - camera.x + CANVAS_WIDTH / 2 - this.width / 2;
        const screenY = this.y - camera.y + CANVAS_HEIGHT / 2 - this.height / 2;

        ctx.save();
        ctx.fillStyle = this.color;
        ctx.fillRect(screenX, screenY, this.width, this.height);
        ctx.restore();
    }

    // Simple rectangle intersection
    getIntersection(rayStartX, rayStartY, rayEndX, rayEndY) {
        // Define rectangle sides
        const lines = [
            { x1: this.x, y1: this.y, x2: this.x + this.width, y2: this.y },
            { x1: this.x + this.width, y1: this.y, x2: this.x + this.width, y2: this.y + this.height },
            { x1: this.x + this.width, y1: this.y + this.height, x2: this.x, y2: this.y + this.height },
            { x1: this.x, y1: this.y + this.height, x2: this.x, y2: this.y },
        ];

        for (let line of lines) {
            const intersection = getLineIntersection(
                rayStartX,
                rayStartY,
                rayEndX,
                rayEndY,
                line.x1,
                line.y1,
                line.x2,
                line.y2
            );
            if (intersection) {
                return intersection;
            }
        }
        return [null, null];
    }
}

// Traffic Light Class
class TrafficLight {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.states = ['green', 'yellow', 'red'];
        this.currentStateIndex = 0;
        this.state = this.states[this.currentStateIndex];
        this.timer = 0;
        this.durations = [5000, 2000, 5000]; // in milliseconds
    }

    update(deltaTime) {
        this.timer += deltaTime;
        if (this.timer > this.durations[this.currentStateIndex]) {
            this.timer = 0;
            this.currentStateIndex = (this.currentStateIndex + 1) % this.states.length;
            this.state = this.states[this.currentStateIndex];
        }
    }

    draw() {
        const screenX = this.x - camera.x + CANVAS_WIDTH / 2;
        const screenY = this.y - camera.y + CANVAS_HEIGHT / 2;

        // Draw pole
        ctx.fillStyle = 'black';
        ctx.fillRect(screenX, screenY, 10, 30);

        // Draw light
        ctx.beginPath();
        ctx.arc(screenX + 5, screenY, 5, 0, Math.PI * 2);
        ctx.fillStyle = this.state;
        ctx.fill();
    }

    // Simple line intersection
    getIntersection(rayStartX, rayStartY, rayEndX, rayEndY) {
        // Consider the traffic light as a point for simplicity
        const distanceToLight = distance(rayStartX, rayStartY, this.x, this.y);
        const angle = Math.atan2(this.y - rayStartY, this.x - rayStartX);
        const hitX = this.x;
        const hitY = this.y;

        if (distanceToLight <= 100) { // Assume ray length is 100
            return [hitX, hitY];
        }

        return [null, null];
    }
}

// Utility Functions
function distance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.hypot(dx, dy);
}

function getLineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
    // Line AB represented as a1x + b1y = c1
    const a1 = y2 - y1;
    const b1 = x1 - x2;
    const c1 = a1 * x1 + b1 * y1;

    // Line CD represented as a2x + b2y = c2
    const a2 = y4 - y3;
    const b2 = x3 - x4;
    const c2 = a2 * x3 + b2 * y3;

    const determinant = a1 * b2 - a2 * b1;

    if (determinant === 0) {
        return null; // Lines are parallel
    } else {
        const x = (b2 * c1 - b1 * c2) / determinant;
        const y = (a1 * c2 - a2 * c1) / determinant;

        // Check if the intersection point is on both line segments
        if (
            x >= Math.min(x1, x2) &&
            x <= Math.max(x1, x2) &&
            x >= Math.min(x3, x4) &&
            x <= Math.max(x3, x4) &&
            y >= Math.min(y1, y2) &&
            y <= Math.max(y1, y2) &&
            y >= Math.min(y3, y4) &&
            y <= Math.max(y3, y4)
        ) {
            return [x, y];
        } else {
            return null;
        }
    }
}

// Initialize Roads
function initRoads() {
    // Example: Horizontal road
    world.roads.push({
        x: 0,
        y: 400,
        width: world.width,
        height: 200,
        lanes: 4,
    });

    // Example: Vertical road
    world.roads.push({
        x: 600,
        y: 0,
        width: 200,
        height: world.height,
        lanes: 4,
    });
}

// Draw Roads
function drawRoads() {
    world.roads.forEach((road) => {
        ctx.fillStyle = '#555'; // Road color
        ctx.fillRect(
            road.x - camera.x + CANVAS_WIDTH / 2,
            road.y - camera.y + CANVAS_HEIGHT / 2,
            road.width,
            road.height
        );

        // Draw lane markings
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        const laneCount = road.lanes;
        if (road.width > road.height) {
            // Horizontal road
            for (let i = 1; i < laneCount; i++) {
                const y = road.y + (road.height / laneCount) * i;
                ctx.setLineDash([20, 15]);
                ctx.beginPath();
                ctx.moveTo(road.x - camera.x + CANVAS_WIDTH / 2, y - camera.y + CANVAS_HEIGHT / 2);
                ctx.lineTo(road.x + road.width - camera.x + CANVAS_WIDTH / 2, y - camera.y + CANVAS_HEIGHT / 2);
                ctx.stroke();
            }
        } else {
            // Vertical road
            for (let i = 1; i < laneCount; i++) {
                const x = road.x + (road.width / laneCount) * i;
                ctx.setLineDash([20, 15]);
                ctx.beginPath();
                ctx.moveTo(x - camera.x + CANVAS_WIDTH / 2, road.y - camera.y + CANVAS_HEIGHT / 2);
                ctx.lineTo(x - camera.x + CANVAS_WIDTH / 2, road.y + road.height - camera.y + CANVAS_HEIGHT / 2);
                ctx.stroke();
            }
        }

        ctx.setLineDash([]); // Reset dash
    });
}

// Initialize Players and Obstacles
let playerCar;
let obstacleCars = [];
let trafficLights = [];

function initEntities() {
    playerCar = new Car(500, 400, 40, 20, 'blue', true);

    // Add some obstacle cars
    obstacleCars.push(new ObstacleCar(800, 400, 40, 20, 'red', 2));
    obstacleCars.push(new ObstacleCar(-200, 500, 40, 20, 'green', 3));
    obstacleCars.push(new ObstacleCar(300, 300, 40, 20, 'orange', 2.5));

    // Add traffic lights
    trafficLights.push(new TrafficLight(600, 400)); // On vertical road intersection
    trafficLights.push(new TrafficLight(800, 600)); // Additional traffic light if needed
}

// Update Entities
function updateEntities(deltaTime) {
    // Update traffic lights
    trafficLights.forEach((tl) => tl.update(deltaTime));

    // Update player car
    playerCar.update(trafficLights, obstacleCars);

    // Update obstacle cars
    obstacleCars.forEach((car) => car.update());

    // Update camera to center on player
    camera.x = playerCar.x;
    camera.y = playerCar.y;
}

// Draw Entities
function drawEntities() {
    // Draw traffic lights
    trafficLights.forEach((tl) => tl.draw());

    // Draw obstacle cars
    obstacleCars.forEach((car) => car.draw());

    // Draw player car on top
    playerCar.draw();
}

// Main Animation Loop
let lastTime = 0;
function animate(time) {
    const deltaTime = time - lastTime;
    lastTime = time;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    drawRoads();
    updateEntities(deltaTime);
    drawEntities();

    requestAnimationFrame(animate);
}

// Initialize Simulation
initRoads();
initEntities();
requestAnimationFrame(animate);