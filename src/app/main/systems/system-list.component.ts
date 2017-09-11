import { Component, OnInit, HostBinding } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { State } from 'clarity-angular';
import { SystemsService } from '../../services/systems.service';
import { ISystem } from './system.interface';
import { FDevIDs } from '../../utilities/fdevids';

@Component({
    selector: 'app-system-list',
    templateUrl: './system-list.component.html',
})
export class SystemListComponent implements OnInit {
    @HostBinding('class.content-area') contentArea = true;
    systemData: ISystem[] = [];
    loading = true;
    totalRecords = 0;
    private pageNumber = 1;
    private tableState: State;
    systemForm = new FormGroup({
        systemName: new FormControl()
    });
    constructor(
        private systemService: SystemsService
    ) { }

    showSystem(systems) {
        this.totalRecords = systems.total;
        this.systemData = systems.docs.map(responseSystem => {
            const id = responseSystem._id;
            const name = responseSystem.name;
            const government = FDevIDs.government[responseSystem.government].name;
            const allegiance = FDevIDs.superpower[responseSystem.allegiance].name;
            const primary_economy = FDevIDs.economy[responseSystem.primary_economy].name;
            const state = FDevIDs.state[responseSystem.state].name;
            return <ISystem>{
                id: id,
                name: name,
                government: government,
                allegiance: allegiance,
                primary_economy: primary_economy,
                state: state
            };
        });
    }

    refresh(tableState: State, beginsWith = this.systemForm.value.systemName) {
        this.tableState = tableState;
        this.loading = true;
        this.pageNumber = Math.ceil((tableState.page.to + 1) / tableState.page.size);

        if (!beginsWith) {
            beginsWith = '';
        }

        this.systemService
            .getSystems(this.pageNumber.toString(), beginsWith)
            .subscribe(systems => this.showSystem(systems));
        this.loading = false;
    }

    ngOnInit() {
        this.systemForm.valueChanges.subscribe(value => {
            this.refresh(this.tableState, value.systemName);
        })
    }
}
