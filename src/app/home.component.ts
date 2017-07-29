import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { State } from 'clarity-angular';
import { SystemsService } from './services/systems.service';
import { ISystem } from './system.interface';
import { FDevIDs } from './fdevids';

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
    private systemData: ISystem[] = [];
    private loading = true;
    private totalRecords = 0;
    private pageNumber = 1;
    constructor(
        private systemService: SystemsService,
        private router: Router
    ) { }

    refresh(tableState: State) {
        this.loading = true;
        this.pageNumber = (tableState.page.to + 1) / tableState.page.size;

        this.systemService.getAllSystems(this.pageNumber.toString()).subscribe(systems => {
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
        });
        this.loading = false;
    }

    onView(system: ISystem) {
        this.router.navigate(['/system', system.id]);
    }

    ngOnInit() { }
}
