import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("data", "0004_add_radio_model"),
    ]

    operations = [
        # Remove NodeWirelessNeighbour before altering NodeSnapshot fields it depends on
        migrations.DeleteModel(
            name="NodeWirelessNeighbour",
        ),
        # Rename timestamp → captured_at (device-reported time)
        migrations.RenameField(
            model_name="nodesnapshot",
            old_name="timestamp",
            new_name="captured_at",
        ),
        # Add received_at (server arrival time); use timezone.now as the one-time
        # default for any pre-existing rows — new rows get auto_now_add behaviour.
        migrations.AddField(
            model_name="nodesnapshot",
            name="received_at",
            field=models.DateTimeField(
                auto_now_add=True,
                default=django.utils.timezone.now,
                help_text="Server arrival timestamp",
            ),
            preserve_default=False,
        ),
    ]
