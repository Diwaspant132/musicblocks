// Copyright (c) 2026 Music Blocks contributors
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the The GNU Affero General Public
// License as published by the Free Software Foundation; either
// version 3 of the License, or (at your option) any later version.
//
// You should have received a copy of the GNU Affero General Public
// License along with this library; if not, write to the Free Software
// Foundation, 51 Franklin Street, Suite 500 Boston, MA 02110-1335 USA

/**
 * @file End-to-end regression fixtures and validation for authentic musical compositions.
 * Verifies multi-turtle 19-EDO microtonal counterpoint and 5-limit Just Intonation polyrhythmic projects.
 */

/* global describe, it, expect */

const fs = require("fs");
const path = require("path");
const { extractProjectDataFromHTML } = require("../utils/utils");

describe("Authentic Musical Compositions & Multi-Turtle Fixtures", () => {
    const projectRoot = path.resolve(__dirname, "../..");

    function validateBlockGraph(blocks) {
        const errors = [];
        const blockMap = new Map();
        blocks.forEach((blk, idx) => {
            const id = blk[0];
            if (id !== idx) {
                errors.push(`Block at index ${idx} has mismatched id ${id}`);
            }
            blockMap.set(id, blk);
        });

        blocks.forEach(blk => {
            const [id, , , , conns] = blk;
            if (!Array.isArray(conns)) {
                errors.push(`Block ${id} conns is not an array: ${JSON.stringify(conns)}`);
                return;
            }
            conns.forEach((targetId, slot) => {
                if (targetId !== null) {
                    if (!blockMap.has(targetId)) {
                        errors.push(
                            `Block ${id} slot ${slot} refers to non-existent block ${targetId}`
                        );
                    } else {
                        const target = blockMap.get(targetId);
                        const targetConns = target[4];
                        if (!targetConns.includes(id)) {
                            errors.push(
                                `Reciprocal link missing: Block ${id} links to ${targetId}, but ${targetId} conns [${targetConns}] does not include ${id}`
                            );
                        }
                    }
                }
            });
        });

        return errors;
    }

    function calculateVoiceDuration(blocks, actionName) {
        const actionBlock = blocks.find(b => {
            const isAction = b[1] === "action" || (Array.isArray(b[1]) && b[1][0] === "action");
            if (isAction) {
                const textBlockId = b[4]?.[1];
                const textBlock = blocks[textBlockId];
                return (
                    textBlock &&
                    Array.isArray(textBlock[1]) &&
                    textBlock[1][1]?.value === actionName
                );
            }
            return false;
        });
        if (!actionBlock) {
            return null;
        }

        let total = 0;
        let curr = actionBlock[4]?.[2];
        const visited = new Set();
        while (curr !== null && curr !== undefined && !visited.has(curr)) {
            visited.add(curr);
            const blk = blocks[curr];
            if (!blk) {
                break;
            }
            const isNewNote =
                blk[1] === "newnote" || (Array.isArray(blk[1]) && blk[1][0] === "newnote");
            if (isNewNote) {
                const divId = blk[4]?.[1];
                const div = blocks[divId];
                const num = blocks[div[4][1]][1][1].value;
                const den = blocks[div[4][2]][1][1].value;
                total += num / den;
                curr = blk[4][3];
            } else if (blk[1] === "hidden") {
                curr = blk[4][1];
            } else {
                break;
            }
        }
        return total;
    }

    describe("19-EDO Microtonal Counterpoint Composition", () => {
        const htmlPath = path.join(projectRoot, "examples", "19-EDO-Microtonal-Counterpoint.html");
        const tbPath = path.join(
            projectRoot,
            "cypress",
            "fixtures",
            "19-edo-counterpoint-minimal.tb"
        );

        it("HTML project file exists and contains valid embedded project code", () => {
            expect(fs.existsSync(htmlPath)).toBe(true);
            const htmlContent = fs.readFileSync(htmlPath, "utf8");
            const rawData = extractProjectDataFromHTML(htmlContent);
            expect(rawData).not.toBeNull();

            const parsed = JSON.parse(rawData);
            expect(Array.isArray(parsed)).toBe(true);
            expect(parsed.length).toBeGreaterThan(50);
        });

        it("Cypress .tb fixture matches embedded HTML project data exactly", () => {
            expect(fs.existsSync(tbPath)).toBe(true);
            const tbContent = fs.readFileSync(tbPath, "utf8");
            const tbParsed = JSON.parse(tbContent);

            const htmlContent = fs.readFileSync(htmlPath, "utf8");
            const htmlParsed = JSON.parse(extractProjectDataFromHTML(htmlContent));

            expect(tbParsed).toEqual(htmlParsed);
        });

        it("passes complete reciprocal block graph connectivity validation", () => {
            const tbContent = fs.readFileSync(tbPath, "utf8");
            const blocks = JSON.parse(tbContent);
            const errors = validateBlockGraph(blocks);
            expect(errors).toEqual([]);
        });

        it("defines exactly two coordinated turtles for polyphonic counterpoint", () => {
            const tbContent = fs.readFileSync(tbPath, "utf8");
            const blocks = JSON.parse(tbContent);

            const startBlocks = blocks.filter(b => Array.isArray(b[1]) && b[1][0] === "start");
            expect(startBlocks).toHaveLength(2);

            const turtle0Id = startBlocks[0][1][1].id;
            const turtle1Id = startBlocks[1][1][1].id;
            expect(turtle0Id).not.toEqual(turtle1Id);
        });

        it("positions the two mice side-by-side at (-50, 0) and (50, 0) via pen up and set xy", () => {
            const tbContent = fs.readFileSync(tbPath, "utf8");
            const blocks = JSON.parse(tbContent);

            const startBlocks = blocks.filter(b => Array.isArray(b[1]) && b[1][0] === "start");
            expect(startBlocks).toHaveLength(2);

            // Flute mouse at (-50, 0)
            expect(startBlocks[0][1][1].xcor).toBe(-50);
            expect(startBlocks[0][1][1].ycor).toBe(0);

            // Cello mouse at (50, 0)
            expect(startBlocks[1][1][1].xcor).toBe(50);
            expect(startBlocks[1][1][1].ycor).toBe(0);

            // Verify both start stacks route through penup then setxy
            [startBlocks[0], startBlocks[1]].forEach((startBlk, idx) => {
                const penupId = startBlk[4][1];
                const penupBlk = blocks[penupId];
                expect(penupBlk[1]).toBe("penup");

                const setxyId = penupBlk[4][1];
                const setxyBlk = blocks[setxyId];
                expect(setxyBlk[1]).toBe("setxy");

                const expectedX = idx === 0 ? -50 : 50;
                const xVal = blocks[setxyBlk[4][1]][1][1].value;
                const yVal = blocks[setxyBlk[4][2]][1][1].value;
                expect(xVal).toBe(expectedX);
                expect(yVal).toBe(0);
            });
        });

        it("configures 19-EDO temperament and appropriate voices", () => {
            const tbContent = fs.readFileSync(tbPath, "utf8");
            const blocks = JSON.parse(tbContent);

            const has19EDO = blocks.some(
                b =>
                    Array.isArray(b[1]) &&
                    b[1][0] === "temperamentname" &&
                    b[1][1]?.value === "equal19"
            );
            expect(has19EDO).toBe(true);

            const hasFlute = blocks.some(
                b => Array.isArray(b[1]) && b[1][0] === "voicename" && b[1][1]?.value === "flute"
            );
            const hasCello = blocks.some(
                b => Array.isArray(b[1]) && b[1][0] === "voicename" && b[1][1]?.value === "cello"
            );
            expect(hasFlute).toBe(true);
            expect(hasCello).toBe(true);
        });

        it("aligns voice durations between flute and cello for concurrent cadence", () => {
            const tbContent = fs.readFileSync(tbPath, "utf8");
            const blocks = JSON.parse(tbContent);

            const fluteDuration = calculateVoiceDuration(blocks, "soprano motif");
            const celloDuration = calculateVoiceDuration(blocks, "bass counterpoint");

            expect(fluteDuration).toBe(4);
            expect(celloDuration).toBe(4);
            expect(fluteDuration).toBe(celloDuration);
        });
    });

    describe("5-Limit Just Intonation Polyrhythm Composition", () => {
        const htmlPath = path.join(
            projectRoot,
            "examples",
            "5-Limit-Just-Intonation-Polyrhythm.html"
        );
        const tbPath = path.join(
            projectRoot,
            "cypress",
            "fixtures",
            "just-5limit-polyrhythm-minimal.tb"
        );

        it("HTML project file exists and contains valid embedded project code", () => {
            expect(fs.existsSync(htmlPath)).toBe(true);
            const htmlContent = fs.readFileSync(htmlPath, "utf8");
            const rawData = extractProjectDataFromHTML(htmlContent);
            expect(rawData).not.toBeNull();

            const parsed = JSON.parse(rawData);
            expect(Array.isArray(parsed)).toBe(true);
            expect(parsed.length).toBeGreaterThan(100);
        });

        it("Cypress .tb fixture matches embedded HTML project data exactly", () => {
            expect(fs.existsSync(tbPath)).toBe(true);
            const tbContent = fs.readFileSync(tbPath, "utf8");
            const tbParsed = JSON.parse(tbContent);

            const htmlContent = fs.readFileSync(htmlPath, "utf8");
            const htmlParsed = JSON.parse(extractProjectDataFromHTML(htmlContent));

            expect(tbParsed).toEqual(htmlParsed);
        });

        it("passes complete reciprocal block graph connectivity validation", () => {
            const tbContent = fs.readFileSync(tbPath, "utf8");
            const blocks = JSON.parse(tbContent);
            const errors = validateBlockGraph(blocks);
            expect(errors).toEqual([]);
        });

        it("defines three coordinated turtles for melody, arpeggio, and drums", () => {
            const tbContent = fs.readFileSync(tbPath, "utf8");
            const blocks = JSON.parse(tbContent);

            const startBlocks = blocks.filter(b => Array.isArray(b[1]) && b[1][0] === "start");
            expect(startBlocks).toHaveLength(3);

            const turtleIds = new Set(startBlocks.map(b => b[1][1].id));
            expect(turtleIds.size).toBe(3);
        });

        it("positions the three mice at (-100, 0), (0, 0), and (100, 0) via pen up and set xy", () => {
            const tbContent = fs.readFileSync(tbPath, "utf8");
            const blocks = JSON.parse(tbContent);

            const startBlocks = blocks.filter(b => Array.isArray(b[1]) && b[1][0] === "start");
            expect(startBlocks).toHaveLength(3);

            const expectedPositions = [
                { x: -100, y: 0 },
                { x: 0, y: 0 },
                { x: 100, y: 0 }
            ];

            startBlocks.forEach((startBlk, idx) => {
                const exp = expectedPositions[idx];
                expect(startBlk[1][1].xcor).toBe(exp.x);
                expect(startBlk[1][1].ycor).toBe(exp.y);

                const penupId = startBlk[4][1];
                const penupBlk = blocks[penupId];
                expect(penupBlk[1]).toBe("penup");

                const setxyId = penupBlk[4][1];
                const setxyBlk = blocks[setxyId];
                expect(setxyBlk[1]).toBe("setxy");

                const xVal = blocks[setxyBlk[4][1]][1][1].value;
                const yVal = blocks[setxyBlk[4][2]][1][1].value;
                expect(xVal).toBe(exp.x);
                expect(yVal).toBe(exp.y);
            });
        });

        it("configures 5-limit Just Intonation, 3-against-2 subdivisions, and percussion", () => {
            const tbContent = fs.readFileSync(tbPath, "utf8");
            const blocks = JSON.parse(tbContent);

            const hasJust5 = blocks.some(
                b =>
                    Array.isArray(b[1]) &&
                    b[1][0] === "temperamentname" &&
                    b[1][1]?.value === "just intonation"
            );
            expect(hasJust5).toBe(true);

            // Triplet subdivision (1/6 duration)
            const hasTripletDiv = blocks.some(b => {
                if (b[1] === "divide" && Array.isArray(b[4])) {
                    const denBlockId = b[4][2];
                    const denBlock = blocks[denBlockId];
                    return (
                        denBlock &&
                        Array.isArray(denBlock[1]) &&
                        denBlock[1][0] === "number" &&
                        denBlock[1][1]?.value === 6
                    );
                }
                return false;
            });
            expect(hasTripletDiv).toBe(true);

            // Percussion drums
            const hasKickDrum = blocks.some(
                b => Array.isArray(b[1]) && b[1][0] === "drumname" && b[1][1]?.value === "kick drum"
            );
            const hasSnareDrum = blocks.some(
                b =>
                    Array.isArray(b[1]) && b[1][0] === "drumname" && b[1][1]?.value === "snare drum"
            );
            expect(hasKickDrum).toBe(true);
            expect(hasSnareDrum).toBe(true);
        });

        it("aligns voice durations across melody, polyrhythm, and percussion", () => {
            const tbContent = fs.readFileSync(tbPath, "utf8");
            const blocks = JSON.parse(tbContent);

            const melodyDuration = calculateVoiceDuration(blocks, "just melody");
            const arpDuration = calculateVoiceDuration(blocks, "triplet arpeggio");
            const drumDuration = calculateVoiceDuration(blocks, "rhythm pulse");

            expect(melodyDuration).toBe(2);
            expect(arpDuration).toBe(2);
            expect(drumDuration).toBe(2);
        });
    });

    describe("Harmonices Mundi (Kepler's Celestial Spirograph) Composition", () => {
        const htmlPath = path.join(
            projectRoot,
            "examples",
            "Harmonices-Mundi-Kepler-Spirograph.html"
        );
        const tbPath = path.join(
            projectRoot,
            "cypress",
            "fixtures",
            "harmonices-mundi-kepler-spirograph.tb"
        );

        it("contains valid standalone HTML example file matching the .tb fixture", () => {
            expect(fs.existsSync(htmlPath)).toBe(true);
            expect(fs.existsSync(tbPath)).toBe(true);

            const htmlContent = fs.readFileSync(htmlPath, "utf8");
            const tbContent = fs.readFileSync(tbPath, "utf8");

            const extractedData = extractProjectDataFromHTML(htmlContent);
            expect(extractedData).not.toBeNull();
            expect(JSON.parse(extractedData)).toEqual(JSON.parse(tbContent));
        });

        it("maintains 100% reciprocal block graph connectivity across all nodes", () => {
            const tbContent = fs.readFileSync(tbPath, "utf8");
            const blocks = JSON.parse(tbContent);

            const errors = validateBlockGraph(blocks);
            expect(errors).toEqual([]);
        });

        it("defines four distinct turtles for Venus, Earth, Mars/Jupiter, and Saturn", () => {
            const tbContent = fs.readFileSync(tbPath, "utf8");
            const blocks = JSON.parse(tbContent);

            const startBlocks = blocks.filter(b => Array.isArray(b[1]) && b[1][0] === "start");
            expect(startBlocks).toHaveLength(4);

            const turtleIds = startBlocks.map(b => b[1][1].id);
            expect(turtleIds).toEqual([1600000000031, 1600000000032, 1600000000033, 1600000000034]);
        });

        it("configures all four authentic orchestral instruments (flute, guitar, clarinet, cello)", () => {
            const tbContent = fs.readFileSync(tbPath, "utf8");
            const blocks = JSON.parse(tbContent);

            const voicenameBlocks = blocks.filter(
                b => Array.isArray(b[1]) && b[1][0] === "voicename"
            );
            const voices = voicenameBlocks.map(b => b[1][1].value);

            expect(voices).toContain("flute");
            expect(voices).toContain("guitar");
            expect(voices).toContain("clarinet");
            expect(voices).toContain("cello");
        });

        it("implements event-driven architectural decoupling with everybeatdo", () => {
            const tbContent = fs.readFileSync(tbPath, "utf8");
            const blocks = JSON.parse(tbContent);

            const everybeatBlock = blocks.find(
                b => b[1] === "everybeatdo" || (Array.isArray(b[1]) && b[1][0] === "everybeatdo")
            );
            expect(everybeatBlock).toBeDefined();

            const targetNameId = everybeatBlock[4][1];
            const targetNameBlock = blocks[targetNameId];
            expect(targetNameBlock[1][1].value).toBe("draw rose petal");
        });

        it("uses dynamic Box variable arithmetic for orbital rose color progression", () => {
            const tbContent = fs.readFileSync(tbPath, "utf8");
            const blocks = JSON.parse(tbContent);

            // storein roseHue
            const storeinBlocks = blocks.filter(
                b => b[1] === "storein" || (Array.isArray(b[1]) && b[1][0] === "storein")
            );
            expect(storeinBlocks.length).toBeGreaterThanOrEqual(2);

            const boxNames = storeinBlocks.map(sb => {
                const nameId = sb[4][1];
                return blocks[nameId][1][1].value;
            });
            expect(boxNames).toContain("roseHue");

            // plus block for incrementing roseHue
            const plusBlocks = blocks.filter(
                b => b[1] === "plus" || (Array.isArray(b[1]) && b[1][0] === "plus")
            );
            expect(plusBlocks.length).toBeGreaterThanOrEqual(1);
        });

        it("correctly spells Kepler's Earth semitone as Ab in Measure 7", () => {
            const tbContent = fs.readFileSync(tbPath, "utf8");
            const blocks = JSON.parse(tbContent);

            const notenameBlocks = blocks.filter(
                b => Array.isArray(b[1]) && b[1][0] === "notename"
            );
            const notes = notenameBlocks.map(b => b[1][1].value);

            expect(notes).toContain("Ab");
        });

        it("synchronizes all four voice durations to exactly 8.0 whole notes (32 beats)", () => {
            const tbContent = fs.readFileSync(tbPath, "utf8");
            const blocks = JSON.parse(tbContent);

            const venusDuration = calculateVoiceDuration(blocks, "venus celestial melody");
            const earthDuration = calculateVoiceDuration(blocks, "earth semitone chaconne");
            const clarinetDuration = calculateVoiceDuration(blocks, "celestial arpeggios");
            const celloDuration = calculateVoiceDuration(blocks, "saturn ground bass");

            expect(venusDuration).toBe(8);
            expect(earthDuration).toBe(8);
            expect(clarinetDuration).toBe(8);
            expect(celloDuration).toBe(8);
        });
    });
});
