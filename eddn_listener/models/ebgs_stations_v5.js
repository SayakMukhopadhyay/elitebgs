/*
 * KodeBlox Copyright 2021 Sayak Mukhopadhyay
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

'use strict'
const mongoose = require('mongoose')
const mongoosePaginate = require('mongoose-paginate')
const mongooseAggregatePaginate = require('mongoose-aggregate-paginate-v2')

let ObjectId = mongoose.Schema.Types.ObjectId

let ebgsStation = new mongoose.Schema(
  {
    eddb_id: { type: Number, index: true },
    name: String,
    name_lower: { type: String, lowercase: true, index: true },
    name_aliases: [
      {
        _id: false,
        name: String,
        name_lower: String
      }
    ],
    market_id: { type: String, index: true },
    type: { type: String, lowercase: true, index: true },
    system: String,
    system_lower: { type: String, lowercase: true, index: true },
    system_id: { type: ObjectId, index: true },
    updated_at: { type: Date, index: true },
    government: { type: String, lowercase: true, index: true },
    economy: { type: String, lowercase: true, index: true },
    all_economies: [
      {
        _id: false,
        name: { type: String, lowercase: true },
        proportion: Number
      }
    ],
    allegiance: { type: String, lowercase: true, index: true },
    state: { type: String, lowercase: true, index: true },
    distance_from_star: Number,
    controlling_minor_faction_cased: String,
    controlling_minor_faction: { type: String, lowercase: true, index: true },
    controlling_minor_faction_id: { type: ObjectId, index: true },
    services: [
      {
        _id: false,
        name: String,
        name_lower: { type: String, lowercase: true }
      }
    ],
    old_market_ids: [String]
  },
  { runSettersOnQuery: true }
)

ebgsStation.plugin(mongoosePaginate)
ebgsStation.plugin(mongooseAggregatePaginate)

module.exports = mongoose.model('ebgsStationV5', ebgsStation)
