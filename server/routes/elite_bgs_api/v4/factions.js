/*
 * KodeBlox Copyright 2017 Sayak Mukhopadhyay
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http: //www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors')
const _ = require('lodash');

const utilities = require('../../../modules/utilities');

let router = express.Router();
let ObjectId = mongoose.Types.ObjectId;
let recordsPerPage = 10;

/**
 * @swagger
 * /factions:
 *   get:
 *     description: Get the Factions
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: id
 *         description: ID of the document.
 *         in: query
 *         type: string
 *       - name: eddbId
 *         description: EDDB ID of the faction.
 *         in: query
 *         type: string
 *       - name: name
 *         description: Faction name.
 *         in: query
 *         type: string
 *       - name: allegiance
 *         description: Name of the allegiance.
 *         in: query
 *         type: string
 *       - name: government
 *         description: Name of the government type.
 *         in: query
 *         type: string
 *       - name: beginswith
 *         description: Starting characters of the faction.
 *         in: query
 *         type: string
 *       - name: system
 *         description: Filter by system.
 *         in: query
 *         type: string
 *       - name: filterSystemInHistory
 *         description: Apply the system filter in the history too.
 *         in: query
 *         type: boolean
 *       - name: activeState
 *         description: Name of the active state of the faction.
 *         in: query
 *         type: string
 *       - name: pendingState
 *         description: Name of the pending state of the faction.
 *         in: query
 *         type: string
 *       - name: recoveringState
 *         description: Name of the recovering state of the faction.
 *         in: query
 *         type: string
 *       - name: minimal
 *         description: Get minimal data of the faction.
 *         in: query
 *         type: boolean
 *       - name: systemDetails
 *         description: Get the detailed system data the faction currently is in.
 *         in: query
 *         type: boolean
 *       - name: timemin
 *         description: Minimum time for the faction history in miliseconds.
 *         in: query
 *         type: string
 *       - name: timemax
 *         description: Maximum time for the faction history in miliseconds.
 *         in: query
 *         type: string
 *       - name: count
 *         description: Number of history records per system presence. Disables timemin and timemax
 *         in: query
 *         type: string
 *       - name: page
 *         description: Page no of response.
 *         in: query
 *         type: integer
 *     responses:
 *       200:
 *         description: An array of factions with historical data
 *         schema:
 *           type: array
 *           items:
 *             $ref: '#/definitions/EBGSFactionsPageV4'
 */
router.get('/', cors(), async (req, res, next) => {
    try {
        let query = new Object;
        let page = 1;
        let history = false;
        let minimal = false;
        let greaterThanTime;
        let lesserThanTime;
        let count;

        if (req.query.id) {
            query._id = utilities.arrayOrNot(req.query.id, ObjectId);
        }
        if (req.query.eddbId) {
            query.eddb_id = utilities.arrayOrNot(req.query.eddbId, parseInt);
        }
        if (req.query.name) {
            query.name_lower = utilities.arrayOrNot(req.query.name, _.toLower);
        }
        if (req.query.allegiance) {
            query.allegiance = utilities.arrayOrNot(req.query.allegiance, _.toLower);
        }
        if (req.query.government) {
            query.government = utilities.arrayOrNot(req.query.government, _.toLower);
        }
        if (req.query.beginsWith) {
            query.name_lower = {
                $regex: new RegExp(`^${_.escapeRegExp(req.query.beginsWith.toLowerCase())}`)
            };
        }
        if (req.query.system) {
            query["faction_presence.system_name_lower"] = utilities.arrayOrNot(req.query.system, _.toLower);
        }
        if (req.query.activeState) {
            query["faction_presence"] = {
                $elemMatch: {
                    active_states: {
                        $elemMatch: {
                            state: utilities.arrayOrNot(req.query.activeState, _.toLower)
                        }
                    }
                }
            };
        }
        if (req.query.pendingState) {
            query["faction_presence"] = {
                $elemMatch: {
                    pending_states: {
                        $elemMatch: {
                            state: utilities.arrayOrNot(req.query.pendingState, _.toLower)
                        }
                    }
                }
            };
        }
        if (req.query.recoveringState) {
            query["faction_presence"] = {
                $elemMatch: {
                    recovering_states: {
                        $elemMatch: {
                            state: utilities.arrayOrNot(req.query.recoveringState, _.toLower)
                        }
                    }
                }
            };
        }
        if (req.query.minimal) {
            minimal = true;
        }
        if (req.query.page) {
            page = req.query.page;
        }
        if (req.query.timemin && req.query.timemax) {
            history = true;
            greaterThanTime = new Date(Number(req.query.timemin));
            lesserThanTime = new Date(Number(req.query.timemax));
        }
        if (req.query.timemin && !req.query.timemax) {
            history = true;
            greaterThanTime = new Date(Number(req.query.timemin));
            lesserThanTime = new Date(Number(+req.query.timemin + 604800000));      // Adding seven days worth of miliseconds
        }
        if (!req.query.timemin && req.query.timemax) {
            history = true;
            greaterThanTime = new Date(Number(+req.query.timemax - 604800000));     // Subtracting seven days worth of miliseconds
            lesserThanTime = new Date(Number(req.query.timemax));
        }
        if (req.query.count) {
            history = true
            count = +req.query.count
        }
        if (history) {
            let result = await getFactions(query, {
                greater: greaterThanTime,
                lesser: lesserThanTime,
                count: count
            }, minimal, page, req);
            res.status(200).json(result);
        } else {
            let result = await getFactions(query, {}, minimal, page, req);
            res.status(200).json(result);
        }
    } catch (err) {
        next(err);
    }
});

async function getFactions(query, history, minimal, page, request) {
    if (_.isEmpty(query)) {
        throw new Error("Add at least 1 query parameter to limit traffic");
    }
    let factionModel = await require('../../../models/ebgs_factions_v4');
    let aggregate = factionModel.aggregate();
    aggregate.match(query).addFields({
        system_names_lower: {
            $map: {
                input: "$faction_presence",
                as: "system_info",
                in: "$$system_info.system_name_lower"
            }
        }
    });

    let countAggregate = factionModel.aggregate();
    countAggregate.match(query);

    if (!_.isEmpty(history)) {
        if (minimal) {
            throw new Error("Minimal cannot work with History");
        }
        let lookupMatchAndArray = [{
            $eq: ["$faction_id", "$$id"]
        }];
        if (history.count) {
            if (request.query.system && request.query.filterSystemInHistory) {
                lookupMatchAndArray.push(query.faction_presence.system_name_lower);
            } else {
                lookupMatchAndArray.push({
                    $in: ["$system_lower", "$$system_name"]
                });
            }
            aggregate.lookup({
                from: "ebgshistoryfactionv4",
                as: "history",
                let: { "id": "$_id", "system_name": "$system_names_lower" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: lookupMatchAndArray
                            }
                        }
                    },
                    {
                        $project: {
                            faction_id: 0,
                            faction_name: 0,
                            faction_name_lower: 0
                        }
                    },
                    {
                        $limit: history.count
                    }
                ]
            });
        } else {
            lookupMatchAndArray.push(
                {
                    $gte: ["$updated_at", new Date(history.greater)]
                },
                {
                    $lte: ["$updated_at", new Date(history.lesser)]
                }
            );
            if (request.query.system && request.query.filterSystemInHistory) {
                lookupMatchAndArray.push(query.faction_presence.system_name_lower);
            }
            aggregate.lookup({
                from: "ebgshistoryfactionv4",
                as: "history",
                let: { "id": "$_id" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: lookupMatchAndArray
                            }
                        }
                    },
                    {
                        $project: {
                            faction_id: 0,
                            faction_name: 0,
                            faction_name_lower: 0
                        }
                    }
                ]
            });
        }
    }

    aggregate.lookup({
        from: "ebgssystemv4",
        as: "system_details",
        let: { "system_names": "$system_names_lower" },
        pipeline: [
            {
                $match: {
                    $expr: {
                        $in: ["$name_lower", "$$system_names"]
                    }
                }
            }
        ]
    });

    let objectToMerge = {
        system_id: {
            $arrayElemAt: [
                {
                    $map: {
                        input: {
                            $filter: {
                                input: "$system_details",
                                as: "system",
                                cond: {
                                    "$eq": ["$$system.name_lower", "$$system_info.system_name_lower"]
                                }
                            }
                        },
                        as: "system_object",
                        in: "$$system_object._id"
                    }
                },
                0
            ]
        }
    };

    if (request.query.systemDetails) {
        objectToMerge["system_details"] = {
            "$arrayElemAt": [
                {
                    "$filter": {
                        input: "$system_details",
                        as: "system",
                        cond: {
                            "$eq": ["$$system.name_lower", "$$system_info.system_name_lower"]
                        }
                    }
                },
                0
            ]
        };
    }

    aggregate.addFields({
        faction_presence: {
            $map: {
                input: "$faction_presence",
                as: "system_info",
                in: {
                    $mergeObjects: [
                        "$$system_info",
                        objectToMerge
                    ]
                }
            }
        }
    });

    if (minimal) {
        aggregate.project({
            faction_presence: 0
        });
    }

    aggregate.project({
        system_names_lower: 0,
        system_details: 0
    });

    return factionModel.aggregatePaginate(aggregate, {
        page,
        countQuery: countAggregate,
        limit: recordsPerPage,
        customLabels: {
            totalDocs: "total",
            totalPages: "pages"
        }
    });
}

module.exports = router;
