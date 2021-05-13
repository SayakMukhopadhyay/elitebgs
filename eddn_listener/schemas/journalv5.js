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

const _ = require('lodash')
const request = require('request-promise-native')
const semver = require('semver')
const mongoose = require('mongoose')

const bugsnagCaller = require('../bugsnag').bugsnagCaller

const ebgsFactionsV5Model = require('../models/ebgs_factions_v5')
const ebgsSystemsV5Model = require('../models/ebgs_systems_v5')
const ebgsStationsV5Model = require('../models/ebgs_stations_v5')
const ebgsHistoryFactionV5Model = require('../models/ebgs_history_faction_v5')
const ebgsHistorySystemV5Model = require('../models/ebgs_history_system_v5')
const ebgsHistoryStationV5Model = require('../models/ebgs_history_station_v5')

const configModel = require('../models/configs')

const nonBGSFactions = require('../nonBGSFactions')

module.exports = Journal

function Journal() {
  this.schemaId = [
    // "http://schemas.elite-markets.net/eddn/journal/1",
    'https://eddn.edcd.io/schemas/journal/1'
    // "https://eddn.edcd.io/schemas/journal/1/test"
  ]

  this.trackSystem = async (message, header) => {
    let mongoSession = await mongoose.startSession()
    if (message.event === 'FSDJump' || message.event === 'Location' || message.event === 'CarrierJump') {
      try {
        // Check if the message is well formed
        await this.checkMessageJump(message, header)

        // Filter out factions that don't contribute to the BGS
        message.Factions = message.Factions.filter((faction) => {
          return nonBGSFactions.indexOf(faction.Name) === -1
        })
        await mongoSession.withTransaction(async () => {
          // First get the system from the db which matches the system address
          let system = await ebgsSystemsV5Model
            .findOne({
              system_address: message.SystemAddress
            })
            .lean()
          if (!system) {
            // If no system with the system address is found, create a basic system
            system = await this.setSystemRecord(message.SystemAddress, {
              name: message.StarSystem,
              name_lower: message.StarSystem.toLowerCase(),
              system_address: message.SystemAddress,
              x: this.correctCoordinates(message.StarPos[0]),
              y: this.correctCoordinates(message.StarPos[1]),
              z: this.correctCoordinates(message.StarPos[2]),
              primary_economy: message.SystemEconomy,
              secondary_economy: message.SystemSecondEconomy
            })
          }

          // Get the faction records next
          let factions = await Promise.all(
            message.Factions.map(async (messageFaction) => {
              // First try to get the faction data
              let factionNameLower = messageFaction.Name.toLowerCase()
              let faction = await ebgsFactionsV5Model
                .findOne({
                  name_lower: factionNameLower
                })
                .lean()
              if (!faction) {
                // If no faction with the name is found, create a basic faction
                faction = await this.setFactionRecord(factionNameLower, {
                  name: messageFaction.Name,
                  name_lower: factionNameLower,
                  government: messageFaction.Government,
                  allegiance: messageFaction.Allegiance
                })
              }
              return faction
            })
          )

          // Generate the faction array that needs to be inserted
          let factionArray = message.Factions.map((faction) => {
            return {
              name: faction.Name,
              name_lower: faction.Name.toLowerCase(),
              faction_id: factions.find((dbfaction) => {
                return dbfaction.name_lower === faction.Name.toLowerCase()
              })._id
            }
          })

          // Get the list of stations that are at stake in an ongoing conflict
          let stationsAtStake = _.flatten(
            message.Conflicts.map((conflict) => {
              return [conflict.Faction1.Stake.toLowerCase(), conflict.Faction2.Stake.toLowerCase()]
            })
          )
          // Get the station records of the stations that are at stake
          let stations = await ebgsStationsV5Model
            .find({
              name_lower: {
                $in: stationsAtStake
              },
              system_id: {
                $in: [system._id]
              }
            })
            .lean()

          // Generate the conflicts array that needs to be inserted
          let conflictsArray = message.Conflicts.map((conflict) => {
            return {
              type: conflict.WarType,
              status: conflict.Status,
              faction1: {
                faction_id: factions.find((dbFaction) => {
                  return dbFaction.name_lower === conflict.Faction1.Name.toLowerCase()
                })._id,
                name: conflict.Faction1.Name,
                name_lower: conflict.Faction1.Name.toLowerCase(),
                station_id: _.get(
                  stations.find((dbStation) => {
                    return (
                      dbStation.system_id.equals(system._id) &&
                      dbStation.name_lower === conflict.Faction1.Stake.toLowerCase()
                    )
                  }),
                  '_id',
                  null
                ), // Get the station id of the station if it exists in db else null
                stake: conflict.Faction1.Stake,
                stake_lower: conflict.Faction1.Stake.toLowerCase(),
                days_won: conflict.Faction1.WonDays
              },
              faction2: {
                faction_id: factions.find((dbFaction) => {
                  return dbFaction.name_lower === conflict.Faction2.Name.toLowerCase()
                })._id,
                name: conflict.Faction2.Name,
                name_lower: conflict.Faction2.Name.toLowerCase(),
                station_id: _.get(
                  stations.find((dbStation) => {
                    return (
                      dbStation.system_id.equals(system._id) &&
                      dbStation.name_lower === conflict.Faction2.Stake.toLowerCase()
                    )
                  }),
                  '_id',
                  null
                ),
                stake: conflict.Faction2.Stake,
                stake_lower: conflict.Faction2.Stake.toLowerCase(),
                days_won: conflict.Faction2.WonDays
              }
            }
          })
          let returnedSystem = await this.formAndSetSystemRecord(message, system, factionArray, conflictsArray)
          // The above function returns undefined when an update operation hasn't happened.
          if (returnedSystem) {
            system = returnedSystem
          }
          await this.formAndSetFactionRecord(message, factions, stations, system)
        })
      } catch (err) {
        if (err.message !== 'Message is not valid') {
          bugsnagCaller(err, {
            metaData: {
              message: message
            }
          })
        }
      }
    }
    if (message.event === 'Docked' || (message.event === 'Location' && message.Docked)) {
      try {
        // Check if the message is well formed
        await this.checkMessageDock(message, header)

        // Create the array to store the station services
        let serviceArray = message.StationServices.map((service) => {
          return {
            name: service,
            name_lower: service.toLowerCase()
          }
        })
        await mongoSession.withTransaction(async () => {
          // First, try to get the system record for this station which matches the system address
          let system = await ebgsSystemsV5Model
            .findOne({
              system_address: message.SystemAddress
            })
            .lean()
          // Try to get the faction record for the station owner
          let faction = await ebgsFactionsV5Model
            .findOne({
              name_lower: message.StationFaction.Name.toLowerCase()
            })
            .lean()

          // If the system or faction for this station doesn't exist in the db yet, don't proceed
          if (!system || !faction) {
            throw new Error('System or faction for station not present: ' + JSON.stringify(message))
          }

          // Get the station from the db which matches the market id
          let station = await ebgsStationsV5Model
            .findOne({
              market_id: message.MarketID
            })
            .lean()

          if (!station) {
            // If the station with the market id is not found it is possible that the market id has changed but the
            // station name hasn't
            station = await ebgsStationsV5Model
              .findOne({
                system_id: system._id,
                name_lower: message.StationName.toLowerCase()
              })
              .lean()

            if (station) {
              // If such a station is found, add the current market id as an old one in the array
              if (!station.old_market_ids) {
                station.old_market_ids = []
              }
              station.old_market_ids.push(station.market_id)
              station.market_id = message.MarketID // Add the new market id as the current one
            }
          }

          if (!station) {
            // If no station with the market id us found, create a basic station
            station = await this.setStationRecord(message.MarketID, {
              name: message.StationName,
              name_lower: message.StationName.toLowerCase(),
              market_id: message.MarketID,
              system: message.StarSystem,
              system_lower: message.StarSystem.toLowerCase(),
              system_id: system._id,
              economy: message.StationEconomy,
              all_economies: message.StationEconomies.map((economy) => {
                return {
                  name: economy.Name,
                  proportion: economy.Proportion
                }
              }),
              distance_from_star: message.DistFromStarLS
            })
          }
          await this.formAndSetStationRecord(message, station, faction, serviceArray)
        })
      } catch (err) {
        if (err.message !== 'Message is not valid') {
          bugsnagCaller(err, {
            metaData: {
              message: message
            }
          })
        }
      }
    }
    mongoSession.endSession()
  }

  this.formAndSetSystemRecord = async (message, system, factionArray, conflictsArray) => {
    // Check if all the parameters are valid
    if (message && system && factionArray.length > 0 && conflictsArray) {
      // Get the faction id of the controlling faction
      let controllingFactionId = _.get(
        factionArray.find((currentFaction) => {
          return currentFaction.name_lower === message.SystemFaction.Name.toLowerCase()
        }),
        'faction_id',
        null
      )

      // Sets the system_address and secondary economy for systems that don't have them yet
      if (!system.system_address || !system.secondary_economy) {
        system.system_address = message.SystemAddress
        system.secondary_economy = message.SystemSecondEconomy
      } // Todo: Remove this once issue #177 is resolved

      // Disregard old messages but accept basic records created without an updated time
      if (!system.updated_at || system.updated_at < new Date(message.timestamp)) {
        // First handle aliasing of system name changes
        // Set an empty array for the system aliases if none exists
        if (!system.name_aliases) {
          system.name_aliases = []
        }

        let nameIsDifferent = false

        if (
          system.system_address === message.SystemAddress.toString() &&
          system.x === this.correctCoordinates(message.StarPos[0]) &&
          system.y === this.correctCoordinates(message.StarPos[1]) &&
          system.z === this.correctCoordinates(message.StarPos[2]) &&
          system.name !== message.StarSystem
        ) {
          // If the incoming system has the same address and location but the name is different
          // push the current name into the aliases list
          if (
            !system.name_aliases.find((alias) => alias.name === system.name && alias.name_lower === system.name_lower)
          ) {
            // Check if the alias already exists
            // Solves an edge case where cached data of the name before renaming comes in
            // Also can handle if a system is renamed back to its original name
            // Essentially it keeps the array unique
            system.name_aliases.push({
              name: system.name,
              name_lower: system.name_lower
            })
          }
          system.name = message.StarSystem
          system.name_lower = message.StarSystem.toLowerCase()
          nameIsDifferent = true
        }

        let historyObject = {}
        if (!system.eddb_id) {
          // Fetch the EDDB ID if not present already
          try {
            system.eddb_id = await this.getSystemEDDBIdByAddress(message.SystemAddress)
          } catch (err) {
            // Set the eddb id to null if any error occurs while fetching
            system.eddb_id = null
          }
        }
        // Check if the incoming details are the same as existing main record details
        if (
          system.government !== message.SystemGovernment.toLowerCase() ||
          system.allegiance !== message.SystemAllegiance.toLowerCase() ||
          system.state !== message.SystemFaction.FactionState.toLowerCase() ||
          system.security !== message.SystemSecurity.toLowerCase() ||
          system.population !== message.Population ||
          system.controlling_minor_faction !== message.SystemFaction.Name.toLowerCase() ||
          !system.conflicts ||
          nameIsDifferent ||
          !_.isEqual(
            _.sortBy(system.conflicts, ['faction1.name_lower']),
            _.sortBy(conflictsArray, ['faction1.name_lower'])
          ) ||
          !_.isEqual(_.sortBy(system.factions, ['name_lower']), _.sortBy(factionArray, ['name_lower']))
        ) {
          let timeNow = Date.now()
          // Get all history records which are less than 48 hours old
          let systemHistory = await ebgsHistorySystemV5Model
            .find({
              system_id: system._id,
              updated_at: {
                $lte: new Date(timeNow),
                $gte: new Date(timeNow - 172800000)
              }
            })
            .sort({ updated_at: -1 })
            .lean()
          // Check if the incoming details is the same as any record present in the last 2 days
          // This prevents caching issues
          if (this.checkSystemWHistory(message, systemHistory, factionArray, conflictsArray)) {
            system.government = message.SystemGovernment
            system.allegiance = message.SystemAllegiance
            system.state = message.SystemFaction.FactionState
            system.security = message.SystemSecurity
            system.population = message.Population
            system.controlling_minor_faction_cased = message.SystemFaction.Name
            system.controlling_minor_faction = message.SystemFaction.Name
            system.controlling_minor_faction_id = controllingFactionId
            system.factions = factionArray
            system.conflicts = conflictsArray
            system.updated_at = message.timestamp

            historyObject = {
              updated_at: message.timestamp,
              updated_by: 'EDDN',
              government: message.SystemGovernment,
              allegiance: message.SystemAllegiance,
              state: message.SystemFaction.FactionState,
              security: message.SystemSecurity,
              population: message.Population,
              controlling_minor_faction_cased: message.SystemFaction.Name,
              controlling_minor_faction: message.SystemFaction.Name,
              controlling_minor_faction_id: controllingFactionId,
              factions: factionArray,
              conflicts: conflictsArray,
              system_id: system._id,
              system_name: system.name,
              system_name_lower: system.name_lower
            }
          }
        } else {
          // Just update the time if the incoming data is the same as the last recorded data
          system.updated_at = message.timestamp
        }

        let systemRecord = await this.setSystemRecord(message.SystemAddress, system)
        if (!_.isEmpty(historyObject)) {
          // Update the history only when the object is not empty
          await this.setSystemHistory(historyObject)
        }
        return systemRecord
      }
    } else {
      throw new Error(
        'Invalid parameters for formAndSetSystemRecord: ' +
          JSON.stringify({
            message,
            system,
            factionArray,
            conflictsArray
          })
      )
    }
  }

  this.formAndSetFactionRecord = async (message, factions, stations, system) => {
    // Check if all the parameters are valid
    if (message && system && factions.length > 0 && stations) {
      // Get all factions from the db which has the current system as a presence system
      let allFactionsPresentInSystemDB = await ebgsFactionsV5Model
        .find({
          faction_presence: {
            $elemMatch: { system_id: system._id }
          }
        })
        .lean()

      // Get the difference between the factions present initially vs in the message
      // These factions needs to be removed
      let toRemove = _.differenceWith(allFactionsPresentInSystemDB, factions, (existingInDB, fetchedByMessages) => {
        return existingInDB.name_lower === fetchedByMessages.name_lower
      })

      // To remove are those factions which are not present in this system anymore
      // Such factions need to be updated too
      // Todo: This doesnt take into consideration old and cached records
      for (let factionObject of toRemove) {
        // Filtering out the current system from the faction presence list of this faction
        factionObject.faction_presence = factionObject.faction_presence.filter(
          (system) => system.system_name_lower !== message.StarSystem.toLowerCase()
        )
        factionObject.updated_at = message.timestamp

        if (!factionObject.eddb_id) {
          try {
            factionObject.eddb_id = await this.getFactionEDDBId(factionObject.name)
          } catch (err) {
            // Set the eddb id to null if any error occurs while fetching
            factionObject.eddb_id = null
          }
        }
        // Do the actual db operations
        await this.setFactionRecord(factionObject.name_lower, factionObject)
      }

      // All factions are already created, either earlier or in their basic form above so we need to update them
      for (let factionObject of factions) {
        // The faction_presence can be null if created as basic
        if (!factionObject.faction_presence) {
          factionObject.faction_presence = []
        }
        // Get the last updated time of this presence record
        let factionPresenceUpdatedAt = _.get(
          factionObject.faction_presence.find((presence) => {
            return presence.system_id.equals(system._id)
          }),
          'updated_at',
          null
        )

        let messageFaction = message.Factions.find((faction) => {
          return faction.Name.toLowerCase() === factionObject.name_lower
        })

        // If the faction presence doesn't have the updated_at record, get from the factionObject itself
        if (!factionPresenceUpdatedAt) {
          factionPresenceUpdatedAt = factionObject.updated_at
        }
        if (!factionPresenceUpdatedAt || factionPresenceUpdatedAt < new Date(message.timestamp)) {
          // Ignore old records but accept if the updated at is null since it might be so for a basic record
          // Decide whether to update the faction record or not
          // Also decide whether to update the main time or not
          let getDoFactionUpdate = await this.doFactionUpdate(
            messageFaction,
            factionObject,
            message,
            factions,
            stations,
            system
          )
          let activeStates = getDoFactionUpdate.activeStates
          let pendingStates = getDoFactionUpdate.pendingStates
          let recoveringStates = getDoFactionUpdate.recoveringStates
          let conflicts = getDoFactionUpdate.conflicts
          let happiness = getDoFactionUpdate.happiness
          let doUpdate = getDoFactionUpdate.doUpdate
          let doUpdateTime = getDoFactionUpdate.doUpdateTime
          let factionPresence = []
          if (doUpdate || doUpdateTime) {
            // If doUpdateTime is set to false set the updated at time
            let factionPresentSystemObject = {}
            factionPresence = factionObject.faction_presence

            // Faction presence can be null when a basic record is created
            if (!factionPresence) {
              factionPresence = []
            }

            factionPresence.forEach((factionPresenceObject, index, factionPresenceArray) => {
              if (factionPresenceObject.system_id.equals(system._id)) {
                // Iterates over all existing faction presences to create a new faction presence object for the current faction
                // This new object is then reapplied over the existing array element to update it
                factionPresentSystemObject = {
                  system_name: message.StarSystem,
                  system_name_lower: message.StarSystem.toLowerCase(),
                  system_id: system._id,
                  state: messageFaction.FactionState,
                  influence: messageFaction.Influence,
                  happiness: happiness,
                  active_states: activeStates,
                  pending_states: pendingStates,
                  recovering_states: recoveringStates,
                  conflicts: conflicts,
                  updated_at: message.timestamp
                }
                factionPresenceArray[index] = factionPresentSystemObject
              }
            })

            // Check if a new faction presence object was initialised or not
            if (_.isEmpty(factionPresentSystemObject)) {
              // This system is not present as a presence system in db.
              // Make a new array element
              factionPresence.push({
                system_name: message.StarSystem,
                system_name_lower: message.StarSystem.toLowerCase(),
                system_id: system._id,
                state: messageFaction.FactionState,
                influence: messageFaction.Influence,
                happiness: happiness,
                active_states: activeStates,
                pending_states: pendingStates,
                recovering_states: recoveringStates,
                conflicts: conflicts,
                updated_at: message.timestamp
              })
            }

            // Update the faction presence and time
            factionObject.updated_at = message.timestamp
            factionObject.faction_presence = factionPresence
            // Get and set the eddb id if not present
            if (!factionObject.eddb_id) {
              try {
                factionObject.eddb_id = await this.getFactionEDDBId(messageFaction.Name)
              } catch (err) {
                factionObject.eddb_id = null
              }
            }
            // Do the actual db operation
            await this.setFactionRecord(factionObject.name_lower, factionObject)
          }
          if (doUpdate) {
            // Create the faction history element for storing current systems
            let systemHistory = factionPresence.map((faction) => {
              return {
                system_id: system._id,
                name: faction.system_name,
                name_lower: faction.system_name_lower
              }
            })

            let historyObject = {
              updated_at: message.timestamp,
              updated_by: 'EDDN',
              system: message.StarSystem,
              system_lower: message.StarSystem.toLowerCase(),
              system_id: system._id,
              faction_id: factionObject._id,
              faction_name: factionObject.name,
              faction_name_lower: factionObject.name_lower,
              state: messageFaction.FactionState,
              influence: messageFaction.Influence,
              happiness: happiness,
              active_states: activeStates,
              pending_states: pendingStates,
              recovering_states: recoveringStates,
              conflicts: conflicts,
              systems: systemHistory
            }

            // Do the db operation for history
            await this.setFactionHistory(historyObject)
          }
        }
      }
    } else {
      throw new Error(
        'Invalid parameters for formAndSetFactionRecord: ' +
          JSON.stringify({
            message,
            factions,
            stations,
            system
          })
      )
    }
  }

  this.formAndSetStationRecord = async (message, station, faction, serviceArray) => {
    // Check if all the parameters are valid
    if (message && station && faction && serviceArray) {
      // Sets the market_id and all_economies for stations that don't have them yet
      if (!station.market_id || !station.all_economies) {
        station.market_id = message.MarketID
        station.all_economies = message.StationEconomies.map((economy) => {
          return {
            name: economy.Name,
            proportion: economy.Proportion
          }
        })
      } // Todo: Remove this once issue #177 is resolved

      // Disregard old messages but accept basic records created without an updated time
      if (!station.updated_at || station.updated_at < new Date(message.timestamp)) {
        // First handle aliasing of system name changes
        // Set an empty array for the system aliases if none exists
        if (!station.name_aliases) {
          station.name_aliases = []
        }

        let nameIsDifferent = false

        if (
          station.market_id === message.MarketID &&
          station.system_lower === message.StarSystem.toLowerCase() &&
          station.name !== message.StationName
        ) {
          // If the incoming station has the same market id and system but the name is different
          // push the current name into the aliases list
          if (
            !station.name_aliases.find(
              (alias) => alias.name === station.name && alias.name_lower === station.name_lower
            )
          ) {
            // Check if the alias already exists
            // Solves an edge case where cached data of the name before renaming comes in
            // Also can handle if a station is renamed back to its original name
            // Essentially it keeps the array unique
            station.name_aliases.push({
              name: station.name,
              name_lower: station.name_lower
            })
          }
          station.name = message.StationName
          station.name_lower = message.StationName.toLowerCase()
          nameIsDifferent = true
        }

        let historyObject = {}
        if (!station.eddb_id) {
          // Fetch the EDDB ID if not present already
          try {
            station.eddb_id = await this.getStationEDDBIdByMarketId(message.MarketID)
          } catch (err) {
            // Set the eddb id to null if any error occurs while fetching
            station.eddb_id = null
          }
        }

        // Temporary fix
        if (!station.distance_from_star) {
          station.distance_from_star = message.DistFromStarLS
        }
        // Check if the incoming details are the same as existing main record details
        if (
          station.government !== message.StationGovernment.toLowerCase() ||
          station.allegiance !== message.StationAllegiance.toLowerCase() ||
          station.state !== message.StationFaction.FactionState.toLowerCase() ||
          station.controlling_minor_faction !== message.StationFaction.Name.toLowerCase() ||
          station.type !== message.StationType.toLowerCase() ||
          nameIsDifferent ||
          !_.isEqual(_.sortBy(station.services, ['name_lower']), _.sortBy(serviceArray, ['name_lower']))
        ) {
          let timeNow = Date.now()
          // Get all history records which are less than 48 hours old
          let stationHistory = await ebgsHistoryStationV5Model
            .find({
              station_id: station._id,
              updated_at: {
                $lte: new Date(timeNow),
                $gte: new Date(timeNow - 172800000)
              }
            })
            .sort({ updated_at: -1 })
            .lean()
          // Check if the incoming details is the same as any record present in the last 2 days
          // This prevents caching issues
          if (this.checkStationWHistory(message, stationHistory, serviceArray)) {
            station.government = message.StationGovernment
            station.allegiance = message.StationAllegiance
            station.state = message.StationFaction.FactionState
            station.type = message.StationType
            station.controlling_minor_faction_cased = message.StationFaction.Name
            station.controlling_minor_faction = message.StationFaction.Name
            station.controlling_minor_faction_id = faction._id
            station.services = serviceArray
            station.updated_at = message.timestamp

            historyObject = {
              updated_at: message.timestamp,
              updated_by: 'EDDN',
              type: message.StationType,
              government: message.StationGovernment,
              allegiance: message.StationAllegiance,
              state: message.StationFaction.FactionState,
              controlling_minor_faction_cased: message.StationFaction.Name,
              controlling_minor_faction: message.StationFaction.Name,
              controlling_minor_faction_id: faction._id,
              services: serviceArray,
              station_id: station._id,
              station_name: station.name,
              station_name_lower: station.name_lower
            }
          }
        } else {
          // Just update the time if the incoming data is the same as the last recorded data
          station.updated_at = message.timestamp
        }

        await this.setStationRecord(message.MarketID, station)
        if (!_.isEmpty(historyObject)) {
          // Update the history only when the object is not empty
          await this.setStationHistory(historyObject)
        }
      }
    } else {
      throw new Error(
        'Invalid parameters for formAndSetStationRecord: ' +
          JSON.stringify({
            message,
            station,
            faction,
            serviceArray
          })
      )
    }
  }

  // Used in V4 FSDJump
  this.checkMessageJump = async (message, header) => {
    if (
      message.StarSystem &&
      message.SystemFaction &&
      typeof message.SystemFaction !== 'string' &&
      !(message.SystemFaction instanceof String) &&
      message.SystemAddress &&
      message.timestamp &&
      message.SystemSecurity &&
      message.SystemAllegiance &&
      message.SystemEconomy &&
      message.StarPos &&
      message.Factions &&
      message.event &&
      message.SystemGovernment
    ) {
      if (!message.SystemFaction.FactionState) {
        message.SystemFaction.FactionState = 'None'
      }
      if (!message.Population) {
        message.Population = 0
      }
      if (!message.Conflicts) {
        message.Conflicts = []
      }
      let configRecord = await configModel.findOne({}).lean()
      if (
        configRecord.blacklisted_software.findIndex((software) => {
          let regexp = new RegExp(software, 'i')
          return regexp.test(header.softwareName)
        }) !== -1
      ) {
        throw new Error('Message from blacklisted software ' + header.softwareName)
      }
      let pass = true
      configRecord.version_software.forEach((software) => {
        if (header.softwareName.toLowerCase() === software.name.toLowerCase()) {
          if (semver.lt(semver.coerce(header.softwareVersion), semver.coerce(software.version))) {
            pass = false
          }
        }
      })
      if (!pass) {
        throw new Error('Message from old version ' + header.softwareVersion + ' software ' + header.softwareName)
      }
      if (
        configRecord.whitelisted_software.findIndex((software) => {
          let regexp = new RegExp(software, 'i')
          return regexp.test(header.softwareName)
        }) === -1
      ) {
        throw new Error('Message not from whitelisted software ' + header.softwareName)
      }
      let messageTimestamp = new Date(message.timestamp)
      let oldestTimestamp = new Date('2017-10-07T00:00:00Z')
      let currentTimestamp = new Date(Date.now() + configRecord.time_offset)
      if (messageTimestamp < oldestTimestamp || messageTimestamp > currentTimestamp) {
        throw new Error('Message timestamp too old or in the future')
      }
    } else {
      throw new Error('Message is not valid')
    }
  }

  // Used in V4 Docked
  this.checkMessageDock = async (message, header) => {
    if (
      message.StarSystem &&
      message.MarketID &&
      message.timestamp &&
      message.StarPos &&
      message.event &&
      message.DistFromStarLS &&
      message.StationEconomy &&
      message.StationEconomies &&
      message.StationFaction &&
      typeof message.StationFaction !== 'string' &&
      !(message.StationFaction instanceof String) &&
      message.StationGovernment &&
      message.StationName &&
      message.StationServices &&
      message.StationType
    ) {
      if (message.StationType === 'FleetCarrier') {
        throw new Error('Message from Fleet Carrier')
      }
      if (message.StationType === 'MegaShip') {
        throw new Error('Message from Mega Ship')
      }
      if (
        nonBGSFactions.find((factionName) => {
          return factionName.toLowerCase() === message.StationFaction.Name.toLowerCase()
        })
      ) {
        throw new Error('Station owned by Non BGS Faction')
      }
      if (!message.StationFaction.FactionState) {
        message.StationFaction.FactionState = 'None'
      }
      if (!message.StationAllegiance) {
        message.StationAllegiance = 'Independent'
      }
      let configRecord = await configModel.findOne({}).lean()
      if (
        configRecord.blacklisted_software.findIndex((software) => {
          let regexp = new RegExp(software, 'i')
          return regexp.test(header.softwareName)
        }) !== -1
      ) {
        throw new Error('Message from blacklisted software ' + header.softwareName)
      }
      let pass = true
      configRecord.version_software.forEach((software) => {
        let regexp = new RegExp(software.name, 'i')
        if (regexp.test(header.softwareName)) {
          if (semver.lt(semver.coerce(header.softwareVersion), semver.coerce(software.version))) {
            pass = false
          }
        }
      })
      if (!pass) {
        throw new Error('Message from old version ' + header.softwareVersion + ' software ' + header.softwareName)
      }
      if (
        configRecord.whitelisted_software.findIndex((software) => {
          let regexp = new RegExp(software, 'i')
          return regexp.test(header.softwareName)
        }) === -1
      ) {
        throw new Error('Message not from whitelisted software ' + header.softwareName)
      }
      let messageTimestamp = new Date(message.timestamp)
      let oldestTimestamp = new Date('2017-10-07T00:00:00Z')
      let currentTimestamp = new Date(Date.now() + configRecord.time_offset)
      if (messageTimestamp < oldestTimestamp || messageTimestamp > currentTimestamp) {
        throw new Error('Message timestamp too old or in the future')
      }
    } else {
      throw new Error('Message is not valid')
    }
  }

  // Used in V4
  this.checkSystemWHistory = (message, history, factionArray, conflictsArray) => {
    for (let item of history) {
      if (
        item.government === message.SystemGovernment.toLowerCase() &&
        item.allegiance === message.SystemAllegiance.toLowerCase() &&
        item.state === message.SystemFaction.FactionState.toLowerCase() &&
        item.security === message.SystemSecurity.toLowerCase() &&
        item.population === message.Population &&
        item.controlling_minor_faction === message.SystemFaction.Name.toLowerCase() &&
        item.conflicts &&
        _.isEqual(
          _.sortBy(item.conflicts, ['faction1.name_lower']),
          _.sortBy(conflictsArray, ['faction1.name_lower'])
        ) &&
        _.isEqual(_.sortBy(item.factions, ['name_lower']), _.sortBy(factionArray, ['name_lower']))
      ) {
        return false
      }
    }
    return true
  }

  // Used in doFactionUpdate
  this.checkFactionWHistory = (
    message,
    messageFaction,
    history,
    activeStates,
    pendingStates,
    recoveringStates,
    conflicts
  ) => {
    for (let item of history) {
      if (
        item.system_lower === message.StarSystem.toLowerCase() &&
        item.state === messageFaction.FactionState.toLowerCase() &&
        item.influence === messageFaction.Influence &&
        item.happiness === messageFaction.Happiness.toLowerCase() &&
        item.conflicts &&
        _.isEqual(_.sortBy(item.conflicts, ['opponent_name_lower']), _.sortBy(conflicts, ['opponent_name_lower'])) &&
        _.isEqual(_.sortBy(item.active_states, ['state']), _.sortBy(activeStates, ['state'])) &&
        _.isEqual(_.sortBy(item.pending_states, ['state']), _.sortBy(pendingStates, ['state'])) &&
        _.isEqual(_.sortBy(item.recovering_states, ['state']), _.sortBy(recoveringStates, ['state']))
      ) {
        return false
      }
    }
    return true
  }

  // Used in V4
  this.checkStationWHistory = (message, history, serviceArray) => {
    for (let item of history) {
      if (
        item.government === message.StationGovernment.toLowerCase() &&
        item.allegiance === message.StationAllegiance.toLowerCase() &&
        item.state === message.StationFaction.FactionState.toLowerCase() &&
        item.controlling_minor_faction === message.StationFaction.Name.toLowerCase() &&
        item.type === message.StationType.toLowerCase() &&
        _.isEqual(_.sortBy(item.services, ['name_lower']), _.sortBy(serviceArray, ['name_lower']))
      ) {
        return false
      }
    }
    return true
  }

  // Used in V4
  this.doFactionUpdate = async (messageFaction, dbFaction, message, factions, stations, system) => {
    // Set the happiness value to "none" if there is no happiness field or if the happiness string is empty
    let happiness = ''
    if (!messageFaction.Happiness || messageFaction.Happiness.length === 0) {
      happiness = 'none'
    } else {
      happiness = messageFaction.Happiness.toLowerCase()
    }
    // Form the states arrays
    let activeStates = []
    if (messageFaction.ActiveStates) {
      activeStates = messageFaction.ActiveStates.map((activeState) => {
        return {
          state: activeState.State.toLowerCase()
        }
      })
    }
    let pendingStates = []
    if (messageFaction.PendingStates) {
      pendingStates = messageFaction.PendingStates.map((pendingState) => {
        return {
          state: pendingState.State.toLowerCase(),
          trend: pendingState.Trend
        }
      })
    }
    let recoveringStates = []
    if (messageFaction.RecoveringStates) {
      recoveringStates = messageFaction.RecoveringStates.map((recoveringState) => {
        return {
          state: recoveringState.State.toLowerCase(),
          trend: recoveringState.Trend
        }
      })
    }
    let factionName = dbFaction.name_lower
    // Form the conflicts array
    let conflicts = []
    if (message.Conflicts) {
      // First filter out the conflicts in this system that doesn't have this faction as a participant
      conflicts = message.Conflicts.filter((conflict) => {
        return (
          conflict.Faction1.Name.toLowerCase() === factionName || conflict.Faction2.Name.toLowerCase() === factionName
        )
      }).map((conflict) => {
        let opponent
        let stake
        let daysWon
        if (conflict.Faction1.Name.toLowerCase() === factionName) {
          opponent = conflict.Faction2.Name
          stake = conflict.Faction1.Stake
          daysWon = +conflict.Faction1.WonDays
        } else {
          opponent = conflict.Faction1.Name
          stake = conflict.Faction2.Stake
          daysWon = +conflict.Faction2.WonDays
        }
        let opponentId = factions.find((faction) => faction.name_lower === opponent.toLowerCase())._id
        let station = stations.find((station) => station.name_lower === stake.toLowerCase())
        let stationId = null
        // An explicit check is needed since the station at stake might not be in the database
        // This could be because nobody has sent sent data yet or it is a non dockable base
        if (station) {
          stationId = station._id
        }
        return {
          type: conflict.WarType,
          status: conflict.Status,
          opponent_name: opponent,
          opponent_name_lower: opponent.toLowerCase(),
          opponent_faction_id: opponentId,
          station_id: stationId,
          stake: stake,
          stake_lower: stake.toLowerCase(),
          days_won: daysWon
        }
      })
    }

    // Check if the incoming message has any different faction detail
    let doUpdate = true
    let doUpdateTime = true
    // If the faction record itself has a newer time (and it exists - so not a basic record)
    // that means this record was updates by a newer message from some other system
    // So make sure not to update the main record time
    if (dbFaction.updated_at && dbFaction.updated_at > new Date(message.timestamp)) {
      doUpdateTime = false
    }

    // Get the faction presence element that needs to be updated
    let factionPresenceElement = dbFaction.faction_presence.find((presence) => {
      return presence.system_name_lower === message.StarSystem.toLowerCase()
    })

    if (
      factionPresenceElement &&
      factionPresenceElement.state === messageFaction.FactionState.toLowerCase() &&
      factionPresenceElement.influence === messageFaction.Influence &&
      factionPresenceElement.happiness === messageFaction.Happiness.toLowerCase() &&
      factionPresenceElement.conflicts &&
      _.isEqual(
        _.sortBy(factionPresenceElement.conflicts, ['opponent_name_lower']),
        _.sortBy(conflicts, ['opponent_name_lower'])
      ) &&
      _.isEqual(_.sortBy(factionPresenceElement.active_states, ['state']), _.sortBy(activeStates, ['state'])) &&
      _.isEqual(_.sortBy(factionPresenceElement.pending_states, ['state']), _.sortBy(pendingStates, ['state'])) &&
      _.isEqual(_.sortBy(factionPresenceElement.recovering_states, ['state']), _.sortBy(recoveringStates, ['state']))
    ) {
      // The presence data in the master record is the same as the incoming message so dont update
      doUpdate = false
    } else {
      let timeNow = Date.now()
      let factionHistory = await ebgsHistoryFactionV5Model
        .find({
          faction_id: dbFaction._id,
          system_id: system._id,
          updated_at: {
            $lte: new Date(timeNow),
            $gte: new Date(timeNow - 172800000) // Get the faction history for the last 48 hours
          }
        })
        .sort({ updated_at: -1 })
        .lean()
      // Check if the incoming details is the same as any record present in the last 2 days
      // This prevents caching issues
      if (
        !this.checkFactionWHistory(
          message,
          messageFaction,
          factionHistory,
          activeStates,
          pendingStates,
          recoveringStates,
          conflicts
        )
      ) {
        doUpdate = false
        doUpdateTime = false
      }
    }

    // doUpdate indicate if the new record should be added into the history and the master record data updated
    // doUpdateTime indicate if the master record's update time should be updated
    return { activeStates, pendingStates, recoveringStates, conflicts, happiness, doUpdate, doUpdateTime }
  }

  // Used in V3 and V4
  this.correctCoordinates = (value) => {
    let floatValue = Number.parseFloat(value)
    let intValue = Math.round(floatValue * 32)
    return intValue / 32
  }

  // Used in V5
  this.getSystemEDDBIdByAddress = async (systemAddress) => {
    let requestOptions = {
      url: 'https://eddbapi.kodeblox.com/api/v4/populatedsystems',
      qs: {
        systemaddress: systemAddress
      },
      json: true,
      resolveWithFullResponse: true
    }
    let response = await request.get(requestOptions)
    if (response.statusCode === 200) {
      let responseObject = response.body
      if (responseObject.total > 0) {
        return responseObject.docs[0].id
      } else {
        throw new Error(response)
      }
    } else {
      throw new Error(response)
    }
  }

  // Used in V3 and V4 and v5
  this.getFactionEDDBId = async (name) => {
    let requestOptions = {
      url: 'https://eddbapi.kodeblox.com/api/v4/factions',
      qs: {
        name: name.toLowerCase()
      },
      json: true,
      resolveWithFullResponse: true
    }
    let response = await request.get(requestOptions)
    if (response.statusCode === 200) {
      let responseObject = response.body
      if (responseObject.total > 0) {
        return responseObject.docs[0].id
      } else {
        throw new Error(response)
      }
    } else {
      throw new Error(response)
    }
  }

  // Used in V5
  this.getStationEDDBIdByMarketId = async (marketId) => {
    let requestOptions = {
      url: 'https://eddbapi.kodeblox.com/api/v4/stations',
      qs: {
        marketid: marketId
      },
      json: true,
      resolveWithFullResponse: true
    }
    let response = await request.get(requestOptions)
    if (response.statusCode === 200) {
      let responseObject = response.body
      if (responseObject.total > 0) {
        return responseObject.docs[0].id
      } else {
        throw new Error(response)
      }
    } else {
      throw new Error(response)
    }
  }

  // Used in V5
  this.setSystemRecord = async (systemAddress, systemObject) => {
    return await ebgsSystemsV5Model
      .findOneAndUpdate(
        {
          system_address: systemAddress
        },
        systemObject,
        {
          upsert: true,
          runValidators: true,
          new: true
        }
      )
      .lean()
  }

  // Used in V5
  this.setFactionRecord = async (nameLower, factionObject) => {
    return await ebgsFactionsV5Model
      .findOneAndUpdate(
        {
          name_lower: nameLower
        },
        factionObject,
        {
          upsert: true,
          runValidators: true,
          new: true
        }
      )
      .lean()
  }

  // Used in V5
  this.setStationRecord = async (marketId, stationObject) => {
    return await ebgsStationsV5Model
      .findOneAndUpdate(
        {
          market_id: marketId
        },
        stationObject,
        {
          upsert: true,
          runValidators: true,
          new: true
        }
      )
      .lean()
  }

  // Used in V4
  this.setSystemHistory = async (historyObject) => {
    let document = new ebgsHistorySystemV5Model(historyObject)
    await document.save()
  }

  // Used in V4
  this.setFactionHistory = async (historyObject) => {
    let document = new ebgsHistoryFactionV5Model(historyObject)
    await document.save()
  }

  // Used in V4
  this.setStationHistory = async (historyObject) => {
    let document = new ebgsHistoryStationV5Model(historyObject)
    await document.save()
  }
}
